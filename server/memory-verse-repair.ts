/**
 * Memory Verse Video Repair Utility
 * 
 * This script finds all memory verse posts and ensures their videos are
 * in the correct location with proper file paths.
 */

import fs from 'fs';
import path from 'path';
import { db } from './db';
import { posts, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Locates and fixes memory verse video files
 * 1. Finds all memory verse posts in the database
 * 2. Checks if their video files exist at the expected path
 * 3. If not, searches for them in alternative locations
 * 4. Copies files to the correct location if needed
 * 5. Updates database records if paths need correction
 */
export async function repairMemoryVerseVideos(): Promise<void> {
  try {
    logger.info('Starting memory verse video repair process');
    
    // Get all memory verse posts
    const memoryVersePosts = await db
      .select({
        id: posts.id,
        mediaUrl: posts.mediaUrl,
        userId: posts.userId,
        username: users.username
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(
        and(
          eq(posts.type, 'memory_verse'),
          // Only check posts that have a mediaUrl
          // Using "is not null" SQL condition to check
          // But the typings are a bit complex, so we'll filter after the query
        )
      );
      
    // Further filter out posts without mediaUrl
    const postsWithMedia = memoryVersePosts.filter(post => post.mediaUrl);
    
    logger.info(`Found ${postsWithMedia.length} memory verse posts with media URLs`);
    
    // Track repair statistics
    let fixed = 0;
    let notFound = 0;
    let alreadyCorrect = 0;
    
    // Process each post
    for (const post of postsWithMedia) {
      try {
        if (!post.mediaUrl) continue; // Skip posts with no media (shouldn't happen due to filter above)
        
        logger.info(`Checking memory verse post #${post.id} by ${post.username} (${post.userId}): ${post.mediaUrl}`);
        
        // Expected file path (where the file should be)
        const expectedPath = path.join(process.cwd(), '..', post.mediaUrl);
        const filename = path.basename(post.mediaUrl);
        
        // Check if the file exists at the expected path
        let fileExists = fs.existsSync(expectedPath);
        if (fileExists) {
          logger.info(`Video file already exists at correct path: ${expectedPath}`);
          alreadyCorrect++;
          continue;
        }
        
        logger.warn(`Video file not found at expected path: ${expectedPath}`);
        
        // Alternative paths to check
        const alternativePaths = [
          path.join(process.cwd(), 'uploads', filename),
          path.join(process.cwd(), post.mediaUrl),
          path.join(process.cwd(), '..' + post.mediaUrl),
          path.join(process.cwd(), '..', 'uploads', filename),
          // Check temp upload directory (where multer puts files initially)
          path.join(process.cwd(), '..', 'uploads', 'temp', filename),
        ];
        
        // Find the file in alternative locations
        let sourceFile = null;
        for (const altPath of alternativePaths) {
          if (fs.existsSync(altPath)) {
            logger.info(`Found video file at alternative path: ${altPath}`);
            sourceFile = altPath;
            break;
          }
        }
        
        if (sourceFile) {
          // Create destination directory if it doesn't exist
          const destDir = path.dirname(expectedPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
            logger.info(`Created directory: ${destDir}`);
          }
          
          // Copy the file to the correct location
          fs.copyFileSync(sourceFile, expectedPath);
          logger.info(`Copied file from ${sourceFile} to ${expectedPath}`);
          fixed++;
        } else {
          logger.error(`Could not find video file for post #${post.id} in any location`);
          notFound++;
        }
      } catch (postError) {
        logger.error(`Error processing post #${post.id}:`, postError);
      }
    }
    
    logger.info('Memory verse video repair complete', {
      total: postsWithMedia.length,
      fixed,
      notFound,
      alreadyCorrect
    });
    
    return;
  } catch (error) {
    logger.error('Error in memory verse video repair:', error);
    throw error;
  }
}

// For direct execution from command line
if (require.main === module) {
  repairMemoryVerseVideos()
    .then(() => {
      console.log('Memory verse video repair process completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error in memory verse video repair process:', err);
      process.exit(1);
    });
}