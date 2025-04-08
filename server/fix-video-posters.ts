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
    
    // Use a query with a 5 second timeout
    let postsWithMedia;
    try {
      // Get all posts with media, but limit to recent posts first (last 100)
      postsWithMedia = await Promise.race([
        db
          .select()
          .from(posts)
          .where(sql`${posts.mediaUrl} IS NOT NULL`)
          .orderBy(sql`${posts.id} DESC`)
          .limit(100),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]) as typeof posts.$inferSelect[];
      
      logger.info(`Found ${postsWithMedia.length} posts with media to check`);
    } catch (queryError) {
      logger.error('Failed to query posts with media:', queryError);
      return; // Return early without throwing to prevent server crash
    }
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process with a smaller batch size and a maximum time limit
    const startTime = Date.now();
    const MAX_PROCESSING_TIME = 30000; // 30 seconds max
    
    for (const post of postsWithMedia) {
      // Check if we've exceeded the time limit
      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        logger.warn('Video poster fix reached time limit, stopping processing');
        break;
      }
      
      try {
        const mediaUrl = post.mediaUrl;
        if (!mediaUrl) {
          skippedCount++;
          continue;
        }
        
        // Skip if this isn't a video post
        if (!isVideoFile(mediaUrl)) {
          logger.debug(`Skipping non-video file: ${mediaUrl}`);
          skippedCount++;
          continue;
        }
        
        // Handle paths consistently with proper error checking
        try {
          // Construct paths
          const mediaRelativePath = mediaUrl.startsWith('/') 
            ? mediaUrl.substring(1) 
            : mediaUrl;
          
          // Double check that the path looks valid
          if (!mediaRelativePath || mediaRelativePath.includes('..')) {
            logger.warn(`Skipping suspicious path: ${mediaUrl}`);
            skippedCount++;
            continue;
          }
          
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
          
          // Create the poster with a timeout
          try {
            // Wrap in a timeout to prevent hanging
            await Promise.race([
              createPosterImage(mediaPath, posterPath),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Poster creation timeout')), 10000)
              )
            ]);
            
            fixedCount++;
            logger.info(`Created poster for post ID ${post.id}: ${posterPath}`);
          } catch (posterError) {
            logger.error(`Failed to create poster for post ${post.id}:`, posterError);
            errorCount++;
          }
        } catch (pathError) {
          logger.error(`Path processing error for post ${post.id}:`, pathError);
          errorCount++;
        }
      } catch (postError) {
        logger.error(`Error processing post:`, postError);
        errorCount++;
      }
    }
    
    logger.info(`Video poster fix processed ${postsWithMedia.length} posts - Fixed: ${fixedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    return;
  } catch (error) {
    // Handle errors but don't propagate them to prevent server crash
    logger.error('Error in fixVideoPosters:', error);
    return; // Return instead of throw
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