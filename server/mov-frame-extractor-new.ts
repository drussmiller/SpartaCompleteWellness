/**
 * MOV Frame Extractor - Clean Implementation
 * 
 * This module extracts a single frame from MOV files and creates one JPG thumbnail
 * with the same filename as the video (but .jpg extension instead of .mov)
 */

import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

/**
 * Extract a frame from a MOV file and create a single JPG thumbnail
 * The thumbnail will have the same name as the video but with .jpg extension
 * 
 * @param sourceMovPath Path to the source MOV file
 * @returns Promise with the thumbnail filename or null if failed
 */
export async function createMovThumbnail(sourceMovPath: string): Promise<string | null> {
  const videoFilename = path.basename(sourceMovPath);
  const thumbnailFilename = videoFilename.replace(/\.mov$/i, '.jpg');
  
  logger.info(`Creating thumbnail for: ${videoFilename}`);

  try {
    // Try multiple positions to find a good frame (avoid black frames at start)
    const positions = [1.0, 2.0, 3.0, 0.5, 4.0];

    for (const position of positions) {
      try {
        const tempJpgPath = path.join('./uploads', `temp-${thumbnailFilename}`);
        
        // Use FFmpeg to extract a frame at the specified position
        await new Promise<void>((resolve, reject) => {
          ffmpeg(sourceMovPath)
            .seek(position)
            .frames(1)
            .output(tempJpgPath)
            .outputOptions([
              '-vf', 'scale=600:400:force_original_aspect_ratio=decrease,pad=600:400:(ow-iw)/2:(oh-ih)/2:black',
              '-q:v', '2'
            ])
            .on('end', () => {
              resolve();
            })
            .on('error', (err: Error) => {
              reject(err);
            })
            .run();
        });

        // Check if the extracted frame is valid (not too small, indicating a black frame)
        const stats = fs.statSync(tempJpgPath);
        
        // Only consider it valid if the size is reasonable (> 1KB)
        if (stats.size > 1024) {
          // Read the valid JPG data
          const jpgBuffer = fs.readFileSync(tempJpgPath);
          
          // Upload the single JPG thumbnail to Object Storage 
          try {
            const { spartaStorage } = await import('./sparta-object-storage');
            
            await spartaStorage.storeBuffer(
              jpgBuffer, 
              thumbnailFilename,
              'image/jpeg',
              true,
              `shared/uploads/${thumbnailFilename}`
            );
            
            logger.info(`Successfully created and uploaded thumbnail: ${thumbnailFilename}`);
          } catch (objStorageError) {
            logger.error(`Failed to upload thumbnail to Object Storage: ${objStorageError}`);
          }
          
          // Clean up temp file
          try { fs.unlinkSync(tempJpgPath); } catch(e) { /* ignore cleanup errors */ }
          
          return thumbnailFilename;
        } else {
          logger.warn(`Frame at ${position}s is too small (${stats.size} bytes), trying another position.`);
          try { fs.unlinkSync(tempJpgPath); } catch(e) { /* ignore cleanup errors */ }
        }
      } catch (error) {
        logger.warn(`Failed to extract frame at position ${position}s: ${error}`);
        continue;
      }
    }
    
    logger.error(`Failed to extract usable frame after trying multiple positions for ${videoFilename}`);
    return null;
  } catch (error) {
    logger.error(`Failed to create thumbnail for ${videoFilename}: ${error}`);
    return null;
  }
}