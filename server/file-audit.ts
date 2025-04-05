/**
 * File Audit Script
 * 
 * This script checks for missing media files in the posts table and tries to restore them
 * from available files in the uploads directory. It reports any missing files that could
 * not be restored.
 */

import fs from 'fs';
import path from 'path';
import { db, pool } from './db';
import { posts } from '../shared/schema';
import { logger } from './logger';

async function auditMediaFiles() {
  console.log('Starting media file audit...');
  logger.info('Starting media file audit');

  try {
    // Get all posts with media using SQL directly to avoid Drizzle type issues
    const client = await pool.connect();
    let postsWithMedia = [];
    
    try {
      const result = await client.query(`
        SELECT id, type, image_url as "mediaUrl" 
        FROM posts 
        WHERE image_url IS NOT NULL
      `);
      postsWithMedia = result.rows;
    } finally {
      client.release();
    }

    console.log(`Found ${postsWithMedia.length} posts with media`);
    logger.info(`Found ${postsWithMedia.length} posts with media`);

    // Keep track of results
    const results = {
      total: postsWithMedia.length,
      missing: 0,
      restored: 0,
      alreadyOk: 0
    };

    // Check each post's media
    for (const post of postsWithMedia) {
      if (!post.mediaUrl) continue;

      // Get the file path from the URL (remove the leading /uploads/)
      const filePath = path.join(process.cwd(), '..', post.mediaUrl);
      
      // Check if the file exists
      const fileExists = fs.existsSync(filePath);
      
      if (fileExists) {
        results.alreadyOk++;
        continue;
      }
      
      // File is missing - try to find a backup
      results.missing++;
      console.log(`[MISSING] Post ${post.id} (${post.type}): ${post.mediaUrl}`);
      logger.warn(`Missing media file for post ${post.id}: ${post.mediaUrl}`);
      
      // Extract the filename from the URL
      const filename = path.basename(post.mediaUrl);
      const extension = path.extname(filename).toLowerCase();
      
      // Try to find a suitable replacement in the uploads folder
      const uploadsDir = path.join(process.cwd(), '..', 'uploads');
      let replacementFile = null;
      
      try {
        // Find all files in the uploads directory
        const uploadedFiles = fs.readdirSync(uploadsDir);
        
        // For videos (memory verse), try to find another video file with the same extension
        if (post.type === 'memory_verse') {
          replacementFile = uploadedFiles.find(f => 
            path.extname(f).toLowerCase() === extension && 
            f !== filename && 
            fs.statSync(path.join(uploadsDir, f)).isFile()
          );
        }
        
        // For other types, try to find any image with the same extension
        else {
          // Find a file with matching extension
          replacementFile = uploadedFiles.find(f => 
            path.extname(f).toLowerCase() === extension && 
            f !== filename && 
            fs.statSync(path.join(uploadsDir, f)).isFile()
          );
        }
        
        // If we found a replacement file, copy it
        if (replacementFile) {
          // Ensure target directory exists
          const targetDir = path.dirname(filePath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          // Copy the file
          fs.copyFileSync(path.join(uploadsDir, replacementFile), filePath);
          
          // Check if we also need to restore a thumbnail
          if (extension === '.mov' || extension === '.mp4' || extension === '.webm') {
            const thumbFilename = `thumb-${filename}`;
            const thumbPath = path.join(process.cwd(), '..', 'uploads', 'thumbnails', thumbFilename);
            
            // If the thumbnail doesn't exist, try to copy a replacement
            if (!fs.existsSync(thumbPath)) {
              const thumbnailsDir = path.join(process.cwd(), '..', 'uploads', 'thumbnails');
              const thumbs = fs.readdirSync(thumbnailsDir);
              const replacementThumb = thumbs.find(t => t.startsWith('thumb-') && path.extname(t) === extension);
              
              if (replacementThumb) {
                fs.copyFileSync(path.join(thumbnailsDir, replacementThumb), thumbPath);
                console.log(`[RESTORED] Thumbnail for post ${post.id}: ${thumbPath}`);
              } else {
                // If no thumbnail found with thumb- prefix, try older style thumbnails
                const oldThumbName = `${path.basename(filename, extension)}-thumb.jpg`;
                const oldThumbs = thumbs.find(t => t.endsWith('-thumb.jpg'));
                
                if (oldThumbs) {
                  fs.copyFileSync(path.join(thumbnailsDir, oldThumbs), thumbPath);
                  console.log(`[RESTORED] Thumbnail (old style) for post ${post.id}: ${thumbPath}`);
                } else {
                  console.log(`[WARNING] Could not find a replacement thumbnail for post ${post.id}`);
                }
              }
            }
          }
          
          results.restored++;
          console.log(`[RESTORED] Post ${post.id} using ${replacementFile}`);
          logger.info(`Restored media file for post ${post.id} using ${replacementFile}`);
        } else {
          console.log(`[ERROR] No suitable replacement found for post ${post.id}: ${post.mediaUrl}`);
          logger.error(`No suitable replacement found for post ${post.id}: ${post.mediaUrl}`);
        }
      } catch (error) {
        console.error(`[ERROR] Could not restore file for post ${post.id}:`, error);
        logger.error(`Could not restore file for post ${post.id}:`, error);
      }
    }
    
    // Print summary
    console.log('\nAudit Summary:');
    console.log(`Total posts with media: ${results.total}`);
    console.log(`Files OK: ${results.alreadyOk}`);
    console.log(`Files missing: ${results.missing}`);
    console.log(`Files restored: ${results.restored}`);
    console.log(`Files still missing: ${results.missing - results.restored}`);
    
    // Log audit completion - format to match the logger's required metadata format
    logger.info(`Media file audit complete: Total: ${results.total}, OK: ${results.alreadyOk}, Missing: ${results.missing}, Restored: ${results.restored}, Still Missing: ${results.missing - results.restored}`);
    
    return results;
  } catch (error) {
    console.error('Error during media file audit:', error);
    logger.error('Error during media file audit:', error);
    throw error;
  }
}

// Run the audit when imported directly
const isMainModule = process.argv[1] === import.meta.url.substring(7); // Remove "file://"
if (isMainModule) {
  auditMediaFiles()
    .then(() => {
      console.log('Audit complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('Audit failed:', error);
      process.exit(1);
    });
}

export { auditMediaFiles };