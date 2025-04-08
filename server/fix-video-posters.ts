/**
 * This script fixes video thumbnails by creating poster files for all video posts
 * It addresses the issue where video thumbnails don't show on mobile devices
 * by creating a dedicated .poster.jpg file for each video
 */

import { db } from './db';
import { posts } from '@shared/schema';
import { logger } from './logger';
import { spartaStorage } from './sparta-object-storage';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { eq, sql, and, not, isNull } from 'drizzle-orm';

const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);
const fsCopyFile = promisify(fs.copyFile);
const fsExists = async (path: string): Promise<boolean> => {
  try {
    await fsAccess(path);
    return true;
  } catch {
    return false;
  }
};

// Common video extensions for detection
const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'];

// Check if a file is a video based on its extension
function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return videoExtensions.includes(ext);
}

// Create a poster image from a video file
async function createPosterImage(videoPath: string, posterPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info(`Creating poster image for video: ${videoPath} -> ${posterPath}`);
    
    // Create the poster directory if it doesn't exist
    const posterDir = path.dirname(posterPath);
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    ffmpeg(videoPath)
      .on('error', (err) => {
        logger.error(`Error creating poster for ${videoPath}:`, err);
        reject(err);
      })
      .screenshots({
        timestamps: ['00:00:01.000'], // Take screenshot at 1 second
        filename: path.basename(posterPath),
        folder: posterDir,
        size: '480x?'  // Scale to 480px width, maintain aspect ratio
      })
      .on('end', () => {
        logger.info(`Poster created successfully for ${videoPath}`);
        resolve();
      });
  });
}

export async function fixVideoPosters(): Promise<void> {
  try {
    logger.info('Starting video poster fix process');
    
    // Get all posts with media
    const postsWithMedia = await db
      .select()
      .from(posts)
      .where(sql`${posts.mediaUrl} IS NOT NULL`);
    
    logger.info(`Found ${postsWithMedia.length} posts with media to check`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const post of postsWithMedia) {
      const mediaUrl = post.mediaUrl;
      if (!mediaUrl) continue;
      
      // Skip if this isn't a video post
      if (!isVideoFile(mediaUrl)) {
        logger.debug(`Skipping non-video file: ${mediaUrl}`);
        skippedCount++;
        continue;
      }
      
      // Construct paths
      const mediaRelativePath = mediaUrl.startsWith('/') 
        ? mediaUrl.substring(1) 
        : mediaUrl;
      
      const mediaPath = path.join(process.cwd(), mediaRelativePath);
      
      // Create the poster filename (same name but with .poster.jpg extension)
      const posterFilename = `${path.basename(mediaPath, path.extname(mediaPath))}.poster.jpg`;
      const posterPath = path.join(path.dirname(mediaPath), posterFilename);
      
      // Check if poster already exists
      if (await fsExists(posterPath)) {
        logger.debug(`Poster already exists for ${mediaUrl} at ${posterPath}`);
        skippedCount++;
        continue;
      }
      
      // Check if original media exists
      if (!(await fsExists(mediaPath))) {
        logger.warn(`Cannot create poster: Original media not found at ${mediaPath}`);
        skippedCount++;
        continue;
      }
      
      // Create the poster
      try {
        await createPosterImage(mediaPath, posterPath);
        fixedCount++;
        logger.info(`Created poster for post ID ${post.id}: ${posterPath}`);
      } catch (err) {
        logger.error(`Failed to create poster for post ${post.id}:`, err);
        skippedCount++;
      }
    }
    
    logger.info(`Video poster fix complete. Fixed: ${fixedCount}, Skipped: ${skippedCount}`);
    return;
  } catch (error) {
    logger.error('Error in fixVideoPosters:', error);
    throw error;
  }
}

// When this script is run directly, execute the fix function
// For ES modules, this is handled by checking import.meta.url
if (import.meta.url.endsWith('fix-video-posters.ts') || 
    import.meta.url.endsWith('fix-video-posters.js')) {
  fixVideoPosters()
    .then(() => {
      console.log('Video poster fix completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error fixing video posters:', err);
      process.exit(1);
    });
}