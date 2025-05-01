/**
 * Media File Synchronization Utility
 * 
 * This script helps sync media files referenced in the database that may be
 * missing in the development environment. It:
 * 
 * 1. Finds all media URLs in post records
 * 2. Checks if the files exist locally
 * 3. If missing, attempts to download them from the production environment
 * 4. Generates appropriate thumbnails for all media types
 * 
 * Usage:
 *   Run this script directly: npx tsx server/sync-media-files.ts
 *   Or via an API endpoint for convenience: GET /api/admin/sync-media
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { db } from './db';
import { posts } from '@shared/schema';
import { logger } from './logger';
import { sql } from 'drizzle-orm';

// Config
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

// Production server base URL (where we'll try to download missing files from)
// This hardcoded value should match your production server
const PROD_BASE_URL = 'https://sparta-faith.replit.app';

/**
 * Ensure all necessary directories exist
 */
const ensureDirectories = (): void => {
  if (!fs.existsSync(UPLOADS_DIR)) {
    logger.info(`Creating uploads directory: ${UPLOADS_DIR}`);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    logger.info(`Creating thumbnails directory: ${THUMBNAILS_DIR}`);
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
};

/**
 * Normalize file paths to ensure consistent format
 * - Removes leading slashes
 * - Trims whitespace
 */
const normalizePath = (url: string): string => {
  if (!url) return '';
  
  // Remove any URL parts (protocol, domain, etc)
  let path = url;
  if (url.startsWith('http')) {
    try {
      const urlObj = new URL(url);
      path = urlObj.pathname;
    } catch (e) {
      // If URL parsing fails, use the original string
      logger.warn(`Failed to parse URL: ${url}`);
    }
  }
  
  // Remove leading slash (if any)
  path = path.replace(/^\/+/, '');
  
  return path.trim();
};

/**
 * Check if a file exists locally
 */
const fileExists = (filePath: string): boolean => {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    return fs.existsSync(fullPath);
  } catch (error) {
    logger.error(`Error checking if file exists: ${filePath}`, error);
    return false;
  }
};

/**
 * Download a file from production environment to local filesystem
 */
const downloadFile = async (fileUrl: string): Promise<boolean> => {
  try {
    const normalizedPath = normalizePath(fileUrl);
    const targetPath = path.join(process.cwd(), normalizedPath);
    
    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // URL to download from
    const sourceUrl = new URL(fileUrl.startsWith('http') ? fileUrl : `${PROD_BASE_URL}${fileUrl}`);
    
    logger.info(`Downloading file from ${sourceUrl.toString()} to ${targetPath}`);
    
    // Create a write stream to save the file
    const fileStream = fs.createWriteStream(targetPath);
    
    // Download the file
    return new Promise<boolean>((resolve) => {
      https.get(sourceUrl, (response) => {
        if (response.statusCode !== 200) {
          logger.error(`Failed to download file, status code: ${response.statusCode}`);
          fileStream.close();
          resolve(false);
          return;
        }
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          logger.info(`Successfully downloaded file to ${targetPath}`);
          resolve(true);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(targetPath, () => {}); // Delete the file on error
          logger.error(`Error saving downloaded file: ${err.message}`);
          resolve(false);
        });
      }).on('error', (err) => {
        fs.unlink(targetPath, () => {}); // Delete the file on error
        logger.error(`Error downloading file: ${err.message}`);
        resolve(false);
      });
    });
  } catch (error) {
    logger.error(`Error in download process: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

/**
 * Generate thumbnails for an image or video
 */
const generateThumbnails = async (mediaUrl: string, isVideo: boolean): Promise<void> => {
  try {
    const srcPath = path.join(process.cwd(), normalizePath(mediaUrl));
    const thumbFilename = `thumb-${path.basename(mediaUrl)}${isVideo ? '.jpg' : ''}`;
    const targetPath = path.join(THUMBNAILS_DIR, thumbFilename);
    
    logger.info(`Generating thumbnail for ${isVideo ? 'video' : 'image'}: ${mediaUrl}`);
    
    // Ensure the thumbnails directory exists
    if (!fs.existsSync(THUMBNAILS_DIR)) {
      fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }
    
    if (isVideo) {
      // For videos, use ffmpeg to create a thumbnail
      return new Promise<void>(async (resolve, reject) => {
        // Import ffmpeg dynamically
        const { default: ffmpeg } = await import('fluent-ffmpeg');
        ffmpeg(srcPath)
          .on('error', (err) => {
            logger.error(`Error creating video thumbnail: ${err?.message || 'Unknown error'}`);
            reject(err || new Error('Unknown ffmpeg error'));
          })
          .on('end', () => {
            logger.info(`Successfully created thumbnail for video at ${targetPath}`);
            resolve();
          })
          .screenshots({
            timestamps: ['00:00:01'],
            folder: THUMBNAILS_DIR,
            filename: thumbFilename,
            size: '320x240'
          });
      });
    } else {
      // For images, use sharp to create a thumbnail
      // Import sharp dynamically
      const sharp = (await import('sharp')).default;
      await sharp(srcPath)
        .resize(320, 240, { fit: 'inside', withoutEnlargement: true })
        .toFile(targetPath);
      
      logger.info(`Successfully created thumbnail for image at ${targetPath}`);
    }
  } catch (error) {
    logger.error(`Error generating thumbnails for ${mediaUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Synchronize media files referenced in the database
 */
export const syncMediaFiles = async (): Promise<{
  total: number;
  existing: number;
  downloaded: number;
  failed: number;
  thumbnailsGenerated: number;
}> => {
  // Initialize counters
  const stats = {
    total: 0,
    existing: 0,
    downloaded: 0,
    failed: 0,
    thumbnailsGenerated: 0
  };
  
  // Ensure needed directories exist
  ensureDirectories();
  
  try {
    // Get all posts with media URLs
    const postsWithMedia = await db
      .select()
      .from(posts)
      .where(sql`"media_url" IS NOT NULL`)
      .execute();
    
    logger.info(`Found ${postsWithMedia.length} posts with media URLs`);
    stats.total = postsWithMedia.length;
    
    // Process each post
    for (const post of postsWithMedia) {
      if (!post.mediaUrl) continue;
      
      const normalizedPath = normalizePath(post.mediaUrl);
      const exists = fileExists(normalizedPath);
      
      if (exists) {
        logger.info(`File exists: ${normalizedPath}`);
        stats.existing++;
      } else {
        logger.info(`File missing: ${normalizedPath}`);
        
        // Try to download the file
        const downloaded = await downloadFile(post.mediaUrl);
        if (downloaded) {
          stats.downloaded++;
          
          // Generate thumbnails for the downloaded file
          await generateThumbnails(post.mediaUrl, !!post.is_video);
          stats.thumbnailsGenerated++;
        } else {
          stats.failed++;
        }
      }
      
      // Check if thumbnails exist, regardless of whether the original exists
      const thumbPath = path.join(THUMBNAILS_DIR, `thumb-${path.basename(post.mediaUrl)}`);
      const thumbExists = fs.existsSync(thumbPath);
      
      if (!thumbExists) {
        // If the original exists but the thumbnail doesn't, generate it
        if (exists || stats.downloaded > 0) {
          await generateThumbnails(post.mediaUrl, !!post.is_video);
          stats.thumbnailsGenerated++;
        }
      }
    }
    
    return stats;
  } catch (error) {
    logger.error(`Error synchronizing media files: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

// This code only runs when using ES modules directly
// Check if this file is being run directly
import { fileURLToPath } from 'url';
import * as url from 'url';

// Get the current file name
const currentFileUrl = url.pathToFileURL(process.argv[1]);
// Compare with the module's URL
const isMainModule = process.argv[1] && (import.meta.url === currentFileUrl.href);

if (isMainModule) {
  syncMediaFiles()
    .then((stats) => {
      console.log('Media synchronization complete:');
      console.log(`Total files processed: ${stats.total}`);
      console.log(`Already existing: ${stats.existing}`);
      console.log(`Downloaded: ${stats.downloaded}`);
      console.log(`Failed to download: ${stats.failed}`);
      console.log(`Thumbnails generated: ${stats.thumbnailsGenerated}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error during media synchronization:', error);
      process.exit(1);
    });
}