/**
 * Video Poster Generator Script
 * 
 * This standalone script generates poster images for video files
 * It can be run manually or scheduled to run periodically
 * It uses batch processing to avoid overloading the system
 */

import { db } from './db';
import { posts } from '@shared/schema';
import { logger } from './logger';
import * as path from 'path';
import * as fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { sql } from 'drizzle-orm';

const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);
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
async function createPosterImage(videoPath: string, posterPath: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info(`Creating poster image for video: ${videoPath} -> ${posterPath}`);
    
    // Create the poster directory if it doesn't exist
    const posterDir = path.dirname(posterPath);
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error(`Poster creation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    ffmpeg(videoPath)
      .on('error', (err) => {
        clearTimeout(timeout);
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
        clearTimeout(timeout);
        logger.info(`Poster created successfully for ${videoPath}`);
        resolve();
      });
  });
}

/**
 * Processes a batch of video posts to create poster images
 * @param batchSize Number of posts to process per run
 * @param maxRunTime Maximum run time in milliseconds
 */
export async function processPosterBatch(batchSize = 20, maxRunTime = 60000): Promise<{
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
}> {
  const stats = {
    processed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0
  };
  
  const startTime = Date.now();
  logger.info(`Starting video poster batch processing (batch size: ${batchSize}, max run time: ${maxRunTime}ms)`);
  
  try {
    // Get posts with media, newest first, limited to batch size
    const postsWithMedia = await db
      .select()
      .from(posts)
      .where(sql`${posts.mediaUrl} IS NOT NULL`)
      .orderBy(sql`${posts.id} DESC`)
      .limit(batchSize);
    
    logger.info(`Found ${postsWithMedia.length} posts with media to check`);
    
    for (const post of postsWithMedia) {
      // Check if we've exceeded the maximum run time
      if (Date.now() - startTime > maxRunTime) {
        logger.warn(`Reached maximum run time of ${maxRunTime}ms, stopping processing`);
        break;
      }
      
      try {
        stats.processed++;
        
        const mediaUrl = post.mediaUrl;
        if (!mediaUrl) {
          stats.skipped++;
          continue;
        }
        
        // Skip if this isn't a video post
        if (!isVideoFile(mediaUrl)) {
          logger.debug(`Skipping non-video file: ${mediaUrl}`);
          stats.skipped++;
          continue;
        }
        
        // Construct paths with proper error handling
        try {
          // Safe path processing
          const mediaRelativePath = mediaUrl.startsWith('/') 
            ? mediaUrl.substring(1) 
            : mediaUrl;
          
          // Validate path
          if (!mediaRelativePath || mediaRelativePath.includes('..')) {
            logger.warn(`Skipping suspicious path: ${mediaUrl}`);
            stats.skipped++;
            continue;
          }
          
          const mediaPath = path.join(process.cwd(), mediaRelativePath);
          
          // Create the poster filename (same name but with .poster.jpg extension)
          const posterFilename = `${path.basename(mediaPath, path.extname(mediaPath))}.poster.jpg`;
          const posterPath = path.join(path.dirname(mediaPath), posterFilename);
          
          // Check if poster already exists
          if (await fsExists(posterPath)) {
            logger.debug(`Poster already exists for ${mediaUrl} at ${posterPath}`);
            stats.skipped++;
            continue;
          }
          
          // Check if original media exists
          if (!(await fsExists(mediaPath))) {
            logger.warn(`Cannot create poster: Original media not found at ${mediaPath}`);
            stats.skipped++;
            continue;
          }
          
          // Create the poster with timeout handling
          try {
            await createPosterImage(mediaPath, posterPath); 
            stats.succeeded++;
            logger.info(`Created poster for post ID ${post.id}: ${posterPath}`);
          } catch (posterError) {
            logger.error(`Failed to create poster for post ${post.id}:`, posterError);
            stats.failed++;
          }
        } catch (pathError) {
          logger.error(`Path processing error for post ${post.id}:`, pathError);
          stats.failed++;
        }
      } catch (postError) {
        logger.error(`Error processing post:`, postError);
        stats.failed++;
      }
    }
    
    logger.info(`Poster batch processing complete - Processed: ${stats.processed}, Succeeded: ${stats.succeeded}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    return stats;
  } catch (error) {
    logger.error('Error in poster batch processing:', error);
    return stats;
  }
}

/**
 * Script entrypoint - when run directly from command line
 */
if (import.meta.url.endsWith('poster-generator.ts') || 
    import.meta.url.endsWith('poster-generator.js')) {
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  let batchSize = 20;
  let maxRunTime = 60000;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch' && i + 1 < args.length) {
      batchSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--timeout' && i + 1 < args.length) {
      maxRunTime = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  processPosterBatch(batchSize, maxRunTime)
    .then((stats) => {
      console.log('Poster generation complete:', stats);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error running poster generator:', err);
      process.exit(1);
    });
}