import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Convert MOV to MP4 with faststart for browser streaming compatibility
 * Uses codec copy (no re-encoding) for speed - just remuxes the container
 * @param inputPath - Path to input video file
 * @param outputPath - Path for output MP4 file
 * @returns Promise that resolves when conversion is complete
 */
export async function convertToMp4WithFaststart(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Video Remux] Converting to MP4 with faststart: ${path.basename(inputPath)}`);
    
    ffmpeg(inputPath)
      .outputOptions([
        '-c copy',                      // Copy codecs (no re-encoding, fast!)
        '-movflags +faststart'          // Move metadata to beginning for streaming
      ])
      .on('start', (commandLine: string) => {
        console.log(`[Video Remux] FFmpeg: ${commandLine.substring(0, 100)}...`);
      })
      .on('end', () => {
        console.log(`[Video Remux] Complete: ${path.basename(outputPath)}`);
        resolve();
      })
      .on('error', (err: Error) => {
        console.error(`[Video Remux] Error: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Check if a video file is MOV format and needs conversion to MP4
 * @param videoPath - Path to video file
 * @returns Promise resolving to true if it's a MOV file
 */
export async function isMovFile(videoPath: string): Promise<boolean> {
  const ext = path.extname(videoPath).toLowerCase();
  return ext === '.mov';
}
