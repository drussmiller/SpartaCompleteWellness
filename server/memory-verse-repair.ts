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
 * Helper function to find possible file paths for a video file
 * This tries common patterns and naming conventions used in the app
 * @param filename The original filename to check
 * @returns Array of possible file paths
 */
function findPossibleVideoFilePaths(filename: string): string[] {
  // Get current working directory
  const cwd = process.cwd();
  const parentDir = path.join(cwd, '..');
  const uploadsDir = path.join(cwd, 'uploads');
  const parentUploadsDir = path.join(parentDir, 'uploads');
  
  // Common directories to check
  const directories = [
    uploadsDir,
    parentUploadsDir,
    path.join(uploadsDir, 'videos'),
    path.join(parentUploadsDir, 'videos'),
    path.join(uploadsDir, 'memory_verse'),
    path.join(parentUploadsDir, 'memory_verse'),
    path.join(uploadsDir, 'temp'),
    path.join(parentUploadsDir, 'temp')
  ];
  
  // Create additional name variations to try
  // For example: if the filename is '123-abc.mp4', try 'memory_verse_123-abc.mp4'
  const nameVariations = [
    filename,
    `memory_verse_${filename}`,
    `memory-verse-${filename}`,
    `memory_verse/${filename}`,
    `memory-verse/${filename}`,
    `mv_${filename}`,
    filename.replace(/[0-9]+-[a-z0-9]+/, match => `memory_verse_${match}`)
  ];
  
  // Generate all combinations of directories and filenames
  const possiblePaths: string[] = [];
  
  for (const dir of directories) {
    for (const name of nameVariations) {
      possiblePaths.push(path.join(dir, name));
    }
  }
  
  // Check uploads directory at root and common subdirectories
  const rootUploads = path.join('/', 'uploads');
  if (fs.existsSync(rootUploads)) {
    possiblePaths.push(path.join(rootUploads, filename));
    possiblePaths.push(path.join(rootUploads, 'videos', filename));
    possiblePaths.push(path.join(rootUploads, 'memory_verse', filename));
  }
  
  return possiblePaths;
}

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
          // Check with different variations of the post URL pattern
          ...findPossibleVideoFilePaths(filename),
        ];
        
        // Log all paths we're checking
        logger.info(`Checking alternative paths for memory verse video (${alternativePaths.length} paths)`);
        
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
    
    // Log repair statistics
    logger.info(`Memory verse video repair complete: ${postsWithMedia.length} total, ${fixed} fixed, ${notFound} not found, ${alreadyCorrect} already correct`);
    
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