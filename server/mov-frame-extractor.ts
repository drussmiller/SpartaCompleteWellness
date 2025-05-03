/**
 * MOV Frame Extractor
 * 
 * This module provides specialized functions for extracting frames from MOV files,
 * which have proven to be challenging to handle properly in the application.
 */
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

/**
 * Extract the first frame from a MOV file and save it as a JPG
 * 
 * @param sourcePath Path to the source MOV file
 * @param outputPath Path where the extracted frame should be saved as JPG
 * @returns Promise that resolves when frame is extracted or rejects with error
 */
export async function extractMovFrame(
  sourcePath: string, 
  outputPath: string
): Promise<void> {
  // Generate a random process ID for logging
  const processId = Math.random().toString(36).substring(2, 8);
  logger.info(`Starting MOV frame extraction for ${path.basename(sourcePath)}`, { processId });
  
  return new Promise<void>((resolve, reject) => {
    // Make sure the output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Configure ffmpeg with optimized settings for MOV files
    const command = ffmpeg(sourcePath)
      .seekInput(0)      // Seek to the very beginning
      .inputOption('-t 0.1')  // Limit input duration to improve speed
      .outputOptions([
        '-frames:v 1',  // Extract exactly one frame
        '-q:v 2',       // High quality
        '-f image2'     // Force image output format
      ])
      .on('start', (commandLine: string) => {
        logger.info(`FFmpeg MOV extraction command: ${commandLine}`, { processId });
      })
      .on('end', () => {
        logger.info(`Successfully extracted frame from MOV file to ${outputPath}`, { processId });
        
        // Verify the output file exists and has content
        try {
          const stats = fs.statSync(outputPath);
          
          if (stats.size > 0) {
            logger.info(`MOV frame extraction successful, size: ${stats.size} bytes`, { processId });
            resolve();
          } else {
            const error = new Error('Extracted frame file is empty');
            logger.error(`MOV frame extraction failed: empty output file`, { processId }, error);
            reject(error);
          }
        } catch (err) {
          logger.error(`Error verifying MOV frame output file: ${err}`, { processId });
          reject(err);
        }
      })
      .on('error', (err: Error, stdout: string, stderr: string) => {
        logger.error(`Error extracting MOV frame: ${err.message}`, { processId, stderr });
        reject(err);
      });
    
    // Execute ffmpeg to create the JPG frame
    command.save(outputPath);
  });
}

/**
 * Create all required thumbnail variants for a MOV file
 * 
 * @param sourceMovPath Path to the source MOV file
 * @param targetThumbPath Path where the main thumbnail should be saved
 * @returns Promise with paths to all generated thumbnails or error
 */
export async function createAllMovThumbnailVariants(
  sourceMovPath: string,
  targetThumbPath: string
): Promise<{ 
  jpgThumbPath: string,
  movThumbPath: string,
  posterPath: string,
  nonPrefixedThumbPath: string 
}> {
  const filename = path.basename(sourceMovPath);
  const dirname = path.dirname(targetThumbPath);
  
  // Define paths for all variants
  const jpgThumbPath = targetThumbPath.replace('.mov', '.jpg');
  const movThumbPath = targetThumbPath;
  const posterFilename = filename.replace('.mov', '.poster.jpg');
  const posterPath = path.join(path.dirname(sourceMovPath), posterFilename);
  const nonPrefixedThumbPath = targetThumbPath.replace('thumb-', '');
  
  try {
    // Extract the frame to the JPG path first
    await extractMovFrame(sourceMovPath, jpgThumbPath);
    
    // Read the JPG data
    const jpgBuffer = fs.readFileSync(jpgThumbPath);
    
    // Copy to all other paths
    fs.writeFileSync(movThumbPath, jpgBuffer);
    fs.writeFileSync(posterPath, jpgBuffer);
    fs.writeFileSync(nonPrefixedThumbPath, jpgBuffer);
    
    logger.info(`Created all MOV thumbnail variants for ${filename}`);
    
    return {
      jpgThumbPath,
      movThumbPath,
      posterPath,
      nonPrefixedThumbPath
    };
  } catch (error) {
    logger.error(`Failed to create MOV thumbnail variants: ${error}`, { sourceFile: filename });
    throw error;
  }
}

/**
 * Create a fallback SVG thumbnail when frame extraction fails
 * 
 * @param targetPaths Object containing paths where SVG thumbnails should be saved
 * @returns Promise that resolves when all SVGs are created
 */
export async function createFallbackSvgThumbnails(targetPaths: {
  jpgThumbPath: string,
  movThumbPath: string,
  posterPath: string,
  nonPrefixedThumbPath: string
}): Promise<void> {
  const videoSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
    '<rect width="600" height="400" fill="#3A57E8"/>' +
    '<circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/>' +
    '<text x="300" y="200" fill="#fff" text-anchor="middle" font-size="14">Video Thumbnail</text>' +
    '<polygon points="270,160 270,240 350,200" fill="#fff"/></svg>'
  );
  
  try {
    // Make sure the directories exist
    Object.values(targetPaths).forEach(p => {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Write SVG to all paths
    fs.writeFileSync(targetPaths.jpgThumbPath, videoSvg);
    fs.writeFileSync(targetPaths.movThumbPath, videoSvg);
    fs.writeFileSync(targetPaths.posterPath, videoSvg);
    fs.writeFileSync(targetPaths.nonPrefixedThumbPath, videoSvg);
    
    logger.info('Created fallback SVG thumbnails for video');
  } catch (error) {
    logger.error(`Failed to create fallback SVG thumbnails: ${error}`);
    throw error;
  }
}