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
  // Replace any video extension with .jpg (mov, mp4, avi, etc.)
  const thumbnailFilename = videoFilename.replace(/\.(mov|mp4|avi|mkv|webm)$/i, '.jpg');

  logger.info(`Creating thumbnail for: ${videoFilename} -> ${thumbnailFilename}`);

  try {
    // Check if video exists and get duration first
    const videoDuration = await getVideoDuration(sourceMovPath);
    logger.info(`Video duration: ${videoDuration} seconds`);

    // For memory verse videos, try positions throughout the video
    // Start closer to the middle and work outward
    const positions = videoDuration > 0 
      ? [
          Math.min(videoDuration * 0.1, 2.0),  // 10% in or 2 seconds, whichever is smaller
          Math.min(videoDuration * 0.2, 4.0),  // 20% in or 4 seconds
          Math.min(videoDuration * 0.3, 6.0),  // 30% in or 6 seconds
          Math.min(videoDuration * 0.05, 1.0), // 5% in or 1 second
          Math.min(videoDuration * 0.4, 8.0),  // 40% in or 8 seconds
          0.5,  // Half second fallback
          0.1   // Very early fallback
        ]
      : [1.0, 2.0, 3.0, 0.5, 4.0]; // Original fallback positions

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
              '-vf', 'scale=600:-1',  // Scale to 600px width, maintain aspect ratio
              '-q:v', '2',
              '-f', 'image2'
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

          // Upload the single JPG thumbnail to Object Storage in main uploads directory
        try {
          const { Client } = await import('@replit/object-storage');
          const client = new Client();

          const thumbnailKey = `shared/uploads/${thumbnailFilename}`;
          await client.uploadFromBytes(thumbnailKey, jpgBuffer);

          logger.info(`Successfully created and uploaded thumbnail: ${thumbnailFilename} from position ${position}s`);
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

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          logger.warn(`Failed to get video duration: ${err.message}`);
          resolve(0); // Return 0 if we can't get duration
        } else {
          const duration = metadata.format?.duration || 0;
          resolve(duration);
        }
      });
    });
  } catch (error) {
    logger.warn(`Error getting video duration: ${error}`);
    return 0;
  }
}