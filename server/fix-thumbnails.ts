/**
 * Thumbnail repair script to generate missing thumbnails
 * This is a standalone script that can be executed to fix missing thumbnail files
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { promises as fsPromises } from 'fs';
import { logger } from './logger.js';
import { spartaStorage } from './sparta-object-storage.js';
import { fileURLToPath } from 'url';

// ES Modules helpers to determine if this is the main module
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

/**
 * Checks if the file is an image based on its extension
 */
function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
}

/**
 * Creates a thumbnail for an image file
 */
async function createThumbnail(sourcePath: string, targetPath: string): Promise<void> {
  try {
    // Ensure directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      await fsPromises.mkdir(targetDir, { recursive: true });
    }
    
    // Create the thumbnail using Sharp
    await sharp(sourcePath)
      .resize(300) // Resize to width of 300px, maintaining aspect ratio
      .jpeg({ quality: 80 })
      .toFile(targetPath);
    
    logger.info(`Created thumbnail at ${targetPath}`);
  } catch (error) {
    logger.error(`Failed to create thumbnail for ${sourcePath}:`, error);
    throw error;
  }
}

/**
 * Main function to repair missing thumbnails
 */
export async function repairMissingThumbnails(): Promise<{
  checked: number;
  created: number;
  skipped: number;
  failed: number;
}> {
  const results = {
    checked: 0,
    created: 0,
    skipped: 0,
    failed: 0
  };

  // Access the private properties - in this case we can use path.resolve to be sure
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  const thumbnailsDir = path.resolve(process.cwd(), 'uploads', 'thumbnails');

  logger.info(`Starting thumbnail repair in ${uploadsDir}`);
  
  try {
    // Make sure the thumbnails directory exists
    if (!fs.existsSync(thumbnailsDir)) {
      await fsPromises.mkdir(thumbnailsDir, { recursive: true });
      logger.info(`Created thumbnails directory: ${thumbnailsDir}`);
    }
    
    // Get all files in the uploads directory
    const files = await fsPromises.readdir(uploadsDir);
    
    for (const file of files) {
      // Skip directories and files that aren't images
      const filePath = path.join(uploadsDir, file);
      const fileStat = await fsPromises.stat(filePath);
      
      if (fileStat.isDirectory() || !isImageFile(file)) {
        results.skipped++;
        continue;
      }
      
      results.checked++;
      
      // Check if thumbnail already exists
      const thumbFilename = `thumb-${file}`;
      const thumbPath = path.join(thumbnailsDir, thumbFilename);
      
      if (fs.existsSync(thumbPath)) {
        logger.info(`Thumbnail already exists for ${file}`);
        continue;
      }
      
      // Create the thumbnail
      try {
        await createThumbnail(filePath, thumbPath);
        results.created++;
      } catch (error) {
        logger.error(`Failed to create thumbnail for ${file}:`, error);
        results.failed++;
      }
    }
    
    logger.info(`Thumbnail repair complete: ${JSON.stringify(results)}`);
    return results;
  } catch (error) {
    logger.error('Error in thumbnail repair process:', error);
    throw error;
  }
}

// If this file is run directly, execute the repair function
if (isMainModule) {
  repairMissingThumbnails()
    .then(results => {
      console.log('Thumbnail repair complete:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Thumbnail repair failed:', error);
      process.exit(1);
    });
}