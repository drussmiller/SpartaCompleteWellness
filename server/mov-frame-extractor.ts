/**
 * MOV Frame Extractor - Clean Implementation
 * 
 * This module provides a single function to extract one frame from MOV files
 * and create one JPG thumbnail with simplified naming.
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';

/**
 * Extract the first frame from a MOV file and save it as a JPG
 * 
 * @param sourcePath Path to the source MOV file
 * @param outputPath Path where the extracted frame should be saved as JPG
 * @param seekPosition Optional position (in seconds) to extract the frame from, defaults to 1.0
 * @returns Promise that resolves when frame is extracted or rejects with error
 */
export async function extractMovFrame(
  sourcePath: string, 
  outputPath: string,
  seekPosition: number = 1.0
): Promise<void> {
  const processId = Math.random().toString(36).substring(2, 8);
  logger.info(`Starting MOV frame extraction for ${path.basename(sourcePath)} at position ${seekPosition}s`);
  
  return new Promise<void>((resolve, reject) => {
    // Make sure the output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Configure ffmpeg with improved settings for better thumbnail quality
    const command = ffmpeg(sourcePath)
      .inputOption(`-ss ${seekPosition}`)   // Seek to specified position
      .outputOptions([
        '-frames:v 1',     // Extract exactly one frame
        '-q:v 2',          // High quality (1-31, where 1 is best)
        '-vf scale=390:-1', // Scale to 390px width while maintaining aspect ratio
        '-f image2'        // Force image output format
      ])
      .on('start', (commandLine: string) => {
        logger.info(`FFmpeg MOV extraction command: ${commandLine}`);
      })
      .on('end', () => {
        logger.info(`Successfully extracted frame from MOV file to ${outputPath}`);
        
        // Verify the output file exists and has content
        try {
          const stats = fs.statSync(outputPath);
          
          if (stats.size > 0) {
            logger.info(`MOV frame extraction successful, size: ${stats.size} bytes`);
            resolve();
          } else {
            const error = new Error('Extracted frame file is empty');
            logger.error(`MOV frame extraction failed: empty output file`);
            reject(error);
          }
        } catch (err) {
          logger.error(`Error verifying MOV frame output file: ${err}`);
          reject(err);
        }
      })
      .on('error', (err: Error) => {
        logger.error(`Error extracting MOV frame: ${err.message}`);
        reject(err);
      });
    
    // Execute ffmpeg to create the JPG frame
    command.save(outputPath);
  });
}

/**
 * Create a single JPG thumbnail for a MOV file
 * This is the main function that should be used for MOV thumbnail generation
 * 
 * @param sourceMovPath Path to the source MOV file
 * @param targetThumbPath Path where the thumbnail should be saved
 * @returns Promise with the path to the generated thumbnail
 */
export async function createAllMovThumbnailVariants(
  sourceMovPath: string,
  targetThumbPath: string
): Promise<{ jpgThumbPath: string }> {
  // Create simple JPG thumbnail with same name as video but .jpg extension
  const jpgThumbPath = targetThumbPath.replace(/\.mov$/i, '.jpg');
  
  try {
    // Check if source file exists and is readable
    if (!fs.existsSync(sourceMovPath)) {
      throw new Error(`Source MOV file does not exist: ${sourceMovPath}`);
    }
    
    const sourceStats = fs.statSync(sourceMovPath);
    if (sourceStats.size === 0) {
      throw new Error(`Source MOV file is empty: ${sourceMovPath}`);
    }
    
    // Try multiple frame positions to get a good non-black frame
    const framePositions = [1.0, 2.0, 0.5, 3.0, 0.1];
    let success = false;
    let lastError: any = null;
    
    for (const position of framePositions) {
      try {
        const tempJpgPath = `${jpgThumbPath}.temp`;
        
        // Extract the frame to a temporary path first
        await extractMovFrame(sourceMovPath, tempJpgPath, position);
        
        // Check if the extracted frame is valid by getting its size
        const stats = fs.statSync(tempJpgPath);
        
        // Only consider it valid if the size is reasonable (> 1KB)
        if (stats.size > 1024) {
          // Move the valid frame to the final location
          fs.renameSync(tempJpgPath, jpgThumbPath);
          
          logger.info(`Successfully created MOV thumbnail at position ${position}s: ${jpgThumbPath}`);
          success = true;
          break;
        } else {
          logger.warn(`Extracted frame at ${position}s is too small (${stats.size} bytes), trying another position`);
          try { fs.unlinkSync(tempJpgPath); } catch(e) { /* ignore cleanup errors */ }
        }
      } catch (error) {
        lastError = error;
        logger.warn(`Failed to extract frame at position ${position}s: ${error}`);
        continue;
      }
    }
    
    if (!success) {
      throw new Error(`Failed to extract usable frame after trying multiple positions: ${lastError}`);
    }
    
    return { jpgThumbPath };
  } catch (error) {
    logger.error(`Failed to create MOV thumbnail: ${error}`);
    throw error;
  }
}

/**
 * Create a fallback SVG thumbnail when frame extraction fails
 * This is only used as a last resort when FFmpeg fails
 */
export async function createFallbackSvgThumbnails(targetPaths: {
  jpgThumbPath: string;
}): Promise<void> {
  const svgContent = `<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a1a"/>
    <text x="50%" y="50%" text-anchor="middle" fill="white" font-size="20" font-family="Arial">
      Video Thumbnail
    </text>
  </svg>`;
  
  try {
    // Write SVG with .jpg extension as fallback
    fs.writeFileSync(targetPaths.jpgThumbPath, svgContent);
    logger.info(`Created fallback SVG thumbnail: ${targetPaths.jpgThumbPath}`);
  } catch (error) {
    logger.error(`Failed to create fallback SVG thumbnail: ${error}`);
    throw error;
  }
}