/**
 * Test script for MOV frame extraction
 * This script tests the direct frame extraction from MOV files using ffmpeg
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import ffmpeg from 'fluent-ffmpeg';

async function testMovFrameExtraction(): Promise<void> {
  console.log('Testing MOV frame extraction with ffmpeg...');
  
  // Look for a MOV file in uploads directory
  const uploadsDir = path.join(process.cwd(), 'uploads');
  
  let movFiles: string[] = [];
  try {
    const files = fs.readdirSync(uploadsDir);
    movFiles = files.filter(file => file.toLowerCase().endsWith('.mov'));
  } catch (err) {
    console.error('Error reading uploads directory:', err);
    return;
  }
  
  if (movFiles.length === 0) {
    console.log('No MOV files found in uploads directory. Cannot run test.');
    return;
  }
  
  // Use the first MOV file for testing
  const testFile = movFiles[0];
  const sourcePath = path.join(uploadsDir, testFile);
  const outputPath = path.join(uploadsDir, 'test-frame.jpg');
  
  console.log(`Found MOV file to test: ${testFile}`);
  console.log(`Source path: ${sourcePath}`);
  console.log(`Output path: ${outputPath}`);
  
  // Create a promise to track completion
  return new Promise((resolve, reject) => {
    // Create a unique process ID for logging
    const processId = Math.random().toString(36).substring(2, 8);
    
    console.log(`[${processId}] Extracting frame from MOV file...`);
    
    // Configure ffmpeg with specific settings for MOV files
    const command = ffmpeg(sourcePath)
      .seekInput(0)      // Seek to the very beginning
      .inputOption('-t 0.1')  // Limit input duration to improve speed
      .outputOptions([
        '-frames:v 1',  // Extract exactly one frame
        '-q:v 2',       // High quality
        '-f image2'     // Force image output format
      ])
      .on('start', (commandLine: string) => {
        console.log(`[${processId}] FFmpeg command: ${commandLine}`);
      })
      .on('end', () => {
        console.log(`[${processId}] Successfully extracted frame!`);
        
        // Verify the output file exists and has content
        try {
          const stats = fs.statSync(outputPath);
          console.log(`Output file size: ${stats.size} bytes`);
          
          if (stats.size > 0) {
            console.log('Frame extraction successful!');
            resolve();
          } else {
            console.error('Output file is empty!');
            reject(new Error('Empty output file'));
          }
        } catch (err) {
          console.error('Error checking output file:', err);
          reject(err);
        }
      })
      .on('error', (err: Error, stdout: string, stderr: string) => {
        console.error(`[${processId}] Error extracting frame: ${err.message}`);
        console.error(`[${processId}] FFmpeg stdout: ${stdout}`);
        console.error(`[${processId}] FFmpeg stderr: ${stderr}`);
        reject(err);
      });
    
    // Execute ffmpeg
    command.save(outputPath);
  });
}

async function main() {
  try {
    await testMovFrameExtraction();
    console.log('Test completed successfully');
  } catch (err) {
    console.error('Test failed:', err);
  }
}

// Run immediately since this is a standalone script
main();

export { testMovFrameExtraction };