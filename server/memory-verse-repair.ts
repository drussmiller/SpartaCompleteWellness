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
 * 5. Ensures thumbnails are created in both formats (with and without thumb- prefix)
 * 6. Updates database records if paths need correction
 */
export async function repairMemoryVerseVideos(): Promise<void> {
  try {
    logger.info('Starting memory verse video repair process');
    
    // Import dependencies dynamically to avoid circular references
    const { spartaStorage } = await import('./sparta-object-storage');
    
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
    let thumbnailsFixed = 0;
    
    // Process each post
    for (const post of postsWithMedia) {
      try {
        if (!post.mediaUrl) continue; // Skip posts with no media (shouldn't happen due to filter above)
        
        logger.info(`Checking memory verse post #${post.id} by ${post.username} (${post.userId}): ${post.mediaUrl}`);
        
        // Expected file path (where the file should be)
        const expectedPath = path.join(process.cwd(), 'uploads', path.basename(post.mediaUrl));
        const filename = path.basename(post.mediaUrl);
        
        // Check if the file exists at the expected path
        let fileExists = fs.existsSync(expectedPath);
        
        // If it doesn't exist in our primary location, search for it
        if (!fileExists) {
          logger.warn(`Video file not found at expected path: ${expectedPath}`);
          
          // Alternative paths to check
          const alternativePaths = [
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
            const uploadsDir = path.dirname(expectedPath);
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
              logger.info(`Created directory: ${uploadsDir}`);
            }
            
            // Copy the file to the correct location
            fs.copyFileSync(sourceFile, expectedPath);
            logger.info(`Copied file from ${sourceFile} to ${expectedPath}`);
            fileExists = true; // Now the file exists at the expected path
            fixed++;
          } else {
            logger.error(`Could not find video file for post #${post.id} in any location`);
            notFound++;
            continue; // Skip to next post, we can't fix thumbnails without the source file
          }
        } else {
          logger.info(`Video file already exists at correct path: ${expectedPath}`);
          alreadyCorrect++;
        }
        
        // Now check and fix thumbnails
        // We need thumbnails in two locations:
        // 1. /uploads/thumbnails/thumb-FILENAME.ext (standard naming convention)
        // 2. /uploads/thumbnails/FILENAME.ext (alternative naming used by some code)
        
        const thumbnailsDir = path.join(process.cwd(), 'uploads', 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
          fs.mkdirSync(thumbnailsDir, { recursive: true });
          logger.info(`Created thumbnails directory: ${thumbnailsDir}`);
        }
        
        const standardThumbPath = path.join(thumbnailsDir, `thumb-${filename}`);
        const alternateThumbPath = path.join(thumbnailsDir, filename);
        
        // Check if thumbnails exist
        const standardThumbExists = fs.existsSync(standardThumbPath);
        const alternateThumbExists = fs.existsSync(alternateThumbPath);
        
        if (!standardThumbExists || !alternateThumbExists) {
          logger.info(`Fixing thumbnails for memory verse video: ${filename}`);
          
          // Process the video to create thumbnails
          try {
            if (!standardThumbExists) {
              logger.info(`Standard thumbnail missing, recreating: ${standardThumbPath}`);
              // Use spartaStorage to regenerate the thumbnail
              await spartaStorage.storeFile(
                expectedPath,
                filename,
                'video/mp4', // Force video mime type
                true // Force video handling
              );
              thumbnailsFixed++;
            }
            
            // If only the standard thumbnail exists, we need to create the alternate one
            if (standardThumbExists && !alternateThumbExists) {
              logger.info(`Alternate thumbnail missing, copying from standard: ${alternateThumbPath}`);
              fs.copyFileSync(standardThumbPath, alternateThumbPath);
              thumbnailsFixed++;
            }
            
            // If only the alternate thumbnail exists, we need to create the standard one
            if (!standardThumbExists && alternateThumbExists) {
              logger.info(`Standard thumbnail missing, copying from alternate: ${standardThumbPath}`);
              fs.copyFileSync(alternateThumbPath, standardThumbPath);
              thumbnailsFixed++;
            }
          } catch (thumbnailError) {
            logger.error(`Error fixing thumbnails for post #${post.id}:`, thumbnailError);
            
            // Basic fallback - create a simple SVG thumbnail if both are missing
            if (!standardThumbExists && !alternateThumbExists) {
              try {
                const svgContent = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                  <rect width="100%" height="100%" fill="#000"/>
                  <text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text>
                  <circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
                  <polygon points="290,180 290,220 320,200" fill="#fff"/>
                </svg>`;
                
                fs.writeFileSync(standardThumbPath, svgContent);
                fs.writeFileSync(alternateThumbPath, svgContent);
                logger.info(`Created fallback SVG thumbnails for post #${post.id}`);
                thumbnailsFixed++;
              } catch (fallbackError) {
                logger.error(`Failed to create fallback thumbnails for post #${post.id}:`, fallbackError);
              }
            }
          }
        } else {
          logger.info(`Both thumbnails already exist for post #${post.id}`);
        }
      } catch (postError) {
        logger.error(`Error processing post #${post.id}:`, postError);
      }
    }
    
    // Log repair statistics
    logger.info(`Memory verse video repair complete: ${postsWithMedia.length} total videos`);
    logger.info(`- ${fixed} videos fixed, ${notFound} not found, ${alreadyCorrect} already correct`);
    logger.info(`- ${thumbnailsFixed} thumbnails fixed or created`);
    
    return;
  } catch (error) {
    logger.error('Error in memory verse video repair:', error);
    throw error;
  }
}

// For direct execution from command line
// Using ESM approach instead of CommonJS require.main
import { fileURLToPath } from 'url';
const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
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