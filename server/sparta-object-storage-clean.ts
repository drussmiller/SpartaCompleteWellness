import * as fs from 'fs';
import * as path from 'path';
import { ObjectStorageClient } from '@replit/object-storage';
import { logger } from './logger';

/**
 * Clean implementation of video thumbnail generation
 */
export async function createVideoThumbnail(videoPath: string, targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    
    // Create a random ID for this process
    const processId = Math.random().toString(36).substring(2, 8);
    
    console.log(`[${processId}] Creating video thumbnail: ${videoPath} -> ${targetPath}`);
    
    // Make sure the thumbnails directory exists
    const thumbnailDir = path.dirname(targetPath);
    if (!fs.existsSync(thumbnailDir)) {
      console.log(`Creating thumbnails directory: ${thumbnailDir}`);
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    // Check if source video exists
    if (!fs.existsSync(videoPath)) {
      reject(new Error(`Source video file not found: ${videoPath}`));
      return;
    }
    
    const command = ffmpeg(videoPath)
      .on('start', (commandLine: string) => {
        console.log(`[${processId}] Executing ffmpeg command: ${commandLine}`);
      })
      .on('end', () => {
        console.log(`[${processId}] Successfully created video thumbnail at ${targetPath}`);
        logger.info(`Created video thumbnail at ${targetPath}`);
        
        // Check if the thumbnail was actually created
        if (!fs.existsSync(targetPath)) {
          console.error(`[${processId}] Thumbnail file doesn't exist after ffmpeg completion: ${targetPath}`);
          reject(new Error('Thumbnail file not created by ffmpeg'));
          return;
        }
        
        resolve();
      })
      .on('error', (error: any, stdout: string, stderr: string) => {
        console.error(`[${processId}] Error creating video thumbnail: ${error.message}`);
        console.error(`[${processId}] ffmpeg stdout: ${stdout}`);
        console.error(`[${processId}] ffmpeg stderr: ${stderr}`);
        logger.error(`Error creating video thumbnail: ${error.message}`, { stderr });
        
        reject(new Error(`Failed to generate video thumbnail: ${error.message}`));
      })
      .seekInput(1)           // Seek to 1 second
      .frames(1)              // Extract 1 frame
      .size('640x360')        // Fixed size to avoid invalid parameters
      .output(targetPath)
      .run();
    
    // Create a timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error(`[${processId}] Thumbnail generation timeout after 60s for ${videoPath}`);
      reject(new Error(`Failed to generate video thumbnail: Timeout after 60s`));
    }, 60000); // 60 second timeout
    
    // Clear the timeout when the process completes or errors
    command.on('end', () => clearTimeout(timeout));
    command.on('error', () => clearTimeout(timeout));
  });
}