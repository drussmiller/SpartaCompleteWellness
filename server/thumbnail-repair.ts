import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { spartaStorage } from './sparta-object-storage';

/**
 * This script checks for any images in the uploads directory that are missing thumbnails
 * and regenerates them. It's helpful for fixing issues where thumbnails weren't created properly.
 */
async function repairThumbnails() {
  console.log('Starting thumbnail repair process...');
  
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const thumbnailsDir = path.join(process.cwd(), 'uploads', 'thumbnails');
  
  if (!fs.existsSync(uploadsDir)) {
    console.error(`Uploads directory does not exist: ${uploadsDir}`);
    return;
  }
  
  // Ensure thumbnails directory exists
  if (!fs.existsSync(thumbnailsDir)) {
    console.log(`Creating thumbnails directory: ${thumbnailsDir}`);
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }
  
  // Get all files in the uploads directory
  const files = fs.readdirSync(uploadsDir).filter(file => {
    // Skip directories and SVG files (our default images)
    const filePath = path.join(uploadsDir, file);
    const isDirectory = fs.statSync(filePath).isDirectory();
    const isSvg = file.endsWith('.svg');
    return !isDirectory && !isSvg;
  });
  
  console.log(`Found ${files.length} files to check for thumbnails`);
  
  let fixed = 0;
  let skipped = 0;
  let errors = 0;
  
  // Check each file
  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const thumbnailFilename = `thumb-${file}`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
    
    // Skip if thumbnail already exists
    if (fs.existsSync(thumbnailPath)) {
      console.log(`✓ Thumbnail already exists for ${file}`);
      skipped++;
      continue;
    }
    
    console.log(`Generating thumbnail for ${file}...`);
    
    try {
      // Determine if this is a video or image based on extension
      const ext = path.extname(file).toLowerCase();
      const isVideo = ['.mp4', '.webm', '.mov', '.avi'].includes(ext);
      
      // Create a fake URL that the storage handler expects
      const fileUrl = `/uploads/${file}`;
      
      // Get the mime type based on extension
      let mimeType = 'image/jpeg'; // Default
      if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.webm') mimeType = 'video/webm';
      else if (ext === '.mov') mimeType = 'video/quicktime';
      
      // Use the storage handler to (re)create thumbnails
      await spartaStorage.storeFile(filePath, file, mimeType, isVideo);
      
      // Verify
      if (fs.existsSync(thumbnailPath)) {
        console.log(`✓ Successfully created thumbnail for ${file}`);
        fixed++;
      } else {
        console.error(`✗ Failed to create thumbnail for ${file} - verification failed`);
        errors++;
      }
    } catch (error) {
      console.error(`✗ Error creating thumbnail for ${file}:`, error);
      logger.error(`Error in thumbnail repair for ${file}:`, error);
      errors++;
    }
  }
  
  console.log('Thumbnail repair process complete.');
  console.log(`Results: ${fixed} fixed, ${skipped} skipped, ${errors} errors`);
}

// For ESM compatibility, no automatic execution

export { repairThumbnails };