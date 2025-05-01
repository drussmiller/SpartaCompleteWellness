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
    // Try as-is path
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      return true;
    }
    
    // Try with uploads/ prefix if it doesn't already have it
    if (!filePath.startsWith('uploads/')) {
      const uploadsPath = path.join(process.cwd(), 'uploads', filePath);
      if (fs.existsSync(uploadsPath)) {
        return true;
      }
    }
    
    // Try to check different possible variants of the path
    // 1. Without leading /
    if (filePath.startsWith('/')) {
      const trimmedPath = path.join(process.cwd(), filePath.substring(1));
      if (fs.existsSync(trimmedPath)) {
        return true;
      }
    }
    
    // 2. With explicit uploads parent dir
    const baseFilename = path.basename(filePath);
    const uploadsFilePath = path.join(process.cwd(), 'uploads', baseFilename);
    if (fs.existsSync(uploadsFilePath)) {
      logger.info(`Found file at alternate path: ${uploadsFilePath}`);
      return true;
    }
    
    return false;
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
    
    // Important: Make sure the file path starts with 'uploads/' if it doesn't already
    const finalPath = normalizedPath.startsWith('uploads/') ? normalizedPath : `uploads/${normalizedPath}`;
    
    const targetPath = path.join(process.cwd(), finalPath);
    
    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      logger.info(`Creating directory: ${targetDir}`);
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Make sure the URL has a leading slash for correct server path
    const urlPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    
    // URL to download from - Make sure to handle both relative and absolute URLs
    let sourceUrlString;
    if (fileUrl.startsWith('http')) {
      // It's already a full URL
      sourceUrlString = fileUrl;
    } else {
      // It's a relative path, format consistently for production server
      // Ensure the path starts with a single slash and does not have redundant prefixes
      let cleanPath = urlPath;
      if (cleanPath.startsWith('/uploads')) {
        // If it's already /uploads/file.jpg, use as is
        sourceUrlString = `${PROD_BASE_URL}${cleanPath}`;
      } else if (cleanPath.startsWith('/')) {
        // If it's just /file.jpg, add /uploads prefix
        sourceUrlString = `${PROD_BASE_URL}/uploads${cleanPath}`;
      } else {
        // If it's just file.jpg, add /uploads/ prefix
        sourceUrlString = `${PROD_BASE_URL}/uploads/${cleanPath.replace(/^\/+/, '')}`;
      }
    }
    
    // Print the full URL for debugging
    logger.info(`Attempting to download from: ${sourceUrlString}`);
    logger.info(`Target save path: ${targetPath}`);
    
    // Create the URL object after fixing the string format
    const sourceUrl = new URL(sourceUrlString);
    
    // Create an empty file first to avoid issues with non-existent paths
    fs.writeFileSync(targetPath, '');
    
    // Create a write stream to save the file
    const fileStream = fs.createWriteStream(targetPath);
    
    // Download the file with a timeout
    return new Promise<boolean>((resolve) => {
      const request = https.get(sourceUrl, {
        headers: {
          // Add user-agent to avoid being blocked
          'User-Agent': 'Mozilla/5.0 (Sparta Media Sync)',
          // Accept common image types
          'Accept': 'image/jpeg,image/png,image/gif,video/mp4,*/*',
        },
        // Set a timeout on the request
        timeout: 15000 // 15 seconds timeout
      }, (response) => {
        if (response.statusCode !== 200) {
          logger.error(`Failed to download file, status code: ${response.statusCode}, URL: ${sourceUrl.toString()}`);
          fileStream.close();
          
          // Try to fix the issue with file type detection
          if (response.statusCode === 404) {
            // If not found, could be a wrong extension - try to guess
            logger.info(`File not found at ${sourceUrl.toString()}, trying alternative extensions...`);
            // Allow the caller to try again with different file format
          }
          
          resolve(false);
          return;
        }
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          
          // Verify the file is not empty
          const stats = fs.statSync(targetPath);
          if (stats.size === 0) {
            logger.error(`Downloaded file is empty, removing: ${targetPath}`);
            fs.unlinkSync(targetPath);
            resolve(false);
            return;
          }
          
          logger.info(`Successfully downloaded file to ${targetPath} (${stats.size} bytes)`);
          resolve(true);
        });
        
        fileStream.on('error', (err) => {
          // Safe file unlink operation
          try {
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
            }
          } catch (e) {
            logger.error(`Error removing file after failed download: ${e instanceof Error ? e.message : String(e)}`);
          }
          logger.error(`Error saving downloaded file: ${err.message}`);
          resolve(false);
        });
      }).on('error', (err) => {
        // Safe file unlink operation
        try {
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        } catch (e) {
          logger.error(`Error removing file after failed download: ${e instanceof Error ? e.message : String(e)}`);
        }
        logger.error(`Error downloading file: ${err.message}, URL: ${sourceUrl.toString()}`);
        resolve(false);
      });
      
      // Set a timeout for the entire request
      request.on('timeout', () => {
        logger.error(`Download timeout for URL: ${sourceUrl.toString()}`);
        request.destroy();
        try {
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
        } catch (e) {
          logger.error(`Error removing file after timeout: ${e instanceof Error ? e.message : String(e)}`);
        }
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
    // mediaUrl is the JavaScript property name, but image_url is the database column name
    const postsWithMedia = await db
      .select()
      .from(posts)
      .where(sql`"image_url" IS NOT NULL`)
      .execute();
    
    logger.info(`Found ${postsWithMedia.length} posts with media URLs`);
    stats.total = postsWithMedia.length;
    
    // Process each post
    for (const post of postsWithMedia) {
      if (!post.mediaUrl) continue;
      
      // In schema.ts, the field is named mediaUrl in JavaScript but image_url in the database
      // Make sure we're using the right property name when working with post objects
      const imageUrl = post.mediaUrl;
      
      const normalizedPath = normalizePath(imageUrl);
      const exists = fileExists(normalizedPath);
      
      if (exists) {
        logger.info(`File exists: ${normalizedPath}`);
        stats.existing++;
      } else {
        logger.info(`File missing: ${normalizedPath}`);
        
        // Try to download the file with original extension
        let downloaded = await downloadFile(imageUrl);
        
        // If download failed and file has an extension, try common alternatives
        if (!downloaded) {
          const parsedPath = path.parse(imageUrl);
          const baseName = parsedPath.name;
          const origExt = parsedPath.ext.toLowerCase();
          
          // Don't try alternatives for known video formats
          const isVideoExt = ['.mp4', '.mov', '.avi', '.wmv', '.webm'].includes(origExt);
          
          if (!isVideoExt && origExt) {
            logger.info(`Initial download failed for ${imageUrl}, trying alternative formats...`);
            
            // List of common image extensions to try
            const altExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            
            // Remove current extension from alternatives if it exists
            const extensions = altExtensions.filter(ext => ext !== origExt);
            
            // Try each alternative extension
            for (const ext of extensions) {
              // Create a new URL with the alternative extension
              const altUrl = `${parsedPath.dir}/${baseName}${ext}`;
              logger.info(`Trying alternative format: ${altUrl}`);
              
              // Attempt download with this extension
              downloaded = await downloadFile(altUrl);
              if (downloaded) {
                logger.info(`Successfully downloaded with alternative extension: ${ext}`);
                
                // Update imageUrl to use the successful extension for thumbnail generation
                imageUrl = altUrl;
                break;
              }
            }
          }
        }
        
        if (downloaded) {
          stats.downloaded++;
          
          // Generate thumbnails for the downloaded file
          await generateThumbnails(imageUrl, !!post.is_video);
          stats.thumbnailsGenerated++;
        } else {
          stats.failed++;
          logger.error(`Failed to download ${imageUrl} after all attempts`);
        }
      }
      
      // Check if thumbnails exist, regardless of whether the original exists
      const thumbBasename = `thumb-${path.basename(imageUrl)}`;
      const thumbPath = path.join(THUMBNAILS_DIR, thumbBasename);
      
      // Also check for video thumbnails that might have .jpg extension
      const videoThumbPath = path.join(THUMBNAILS_DIR, `${thumbBasename}.jpg`);
      
      const thumbExists = fs.existsSync(thumbPath) || fs.existsSync(videoThumbPath);
      
      logger.info(`Checking thumbnail: ${thumbPath}, exists: ${fs.existsSync(thumbPath)}`);
      if (post.is_video) {
        logger.info(`Checking video thumbnail: ${videoThumbPath}, exists: ${fs.existsSync(videoThumbPath)}`);
      }
      
      if (!thumbExists) {
        // If the original exists or was just downloaded, generate the thumbnail
        const fileAvailable = exists || stats.downloaded > 0;
        
        if (fileAvailable) {
          logger.info(`Generating thumbnail for: ${imageUrl}, isVideo: ${!!post.is_video}`);
          await generateThumbnails(imageUrl, !!post.is_video);
          stats.thumbnailsGenerated++;
        } else {
          logger.warn(`Cannot generate thumbnail for missing file: ${imageUrl}`);
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