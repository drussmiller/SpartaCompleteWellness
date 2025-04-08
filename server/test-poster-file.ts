/**
 * This script tests the video poster file generation
 * It creates a sample video file and checks if the poster file is properly generated
 */

import { spartaStorage } from './sparta-object-storage';
import { fixVideoPosters } from './fix-video-posters';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { db } from './db';
import { posts } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

async function testPosterFileGeneration() {
  try {
    console.log('Starting poster file generation test');

    // Find a video file to test with
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const testFilesDir = path.join(process.cwd(), 'server', 'test-video');
    
    // Try to find a video file in the uploads directory
    let testVideoPath = '';
    let testVideoFound = false;
    
    // First check the uploads directory
    if (fs.existsSync(uploadsDir)) {
      console.log('Searching for videos in uploads directory');
      const files = fs.readdirSync(uploadsDir);
      
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        if (fs.statSync(filePath).isFile() && 
            ['.mp4', '.mov', '.webm', '.avi'].includes(path.extname(filePath).toLowerCase())) {
          testVideoPath = filePath;
          testVideoFound = true;
          console.log(`Found test video: ${testVideoPath}`);
          break;
        }
      }
    }
    
    // If no video found in uploads, check the test-video directory
    if (!testVideoFound && fs.existsSync(testFilesDir)) {
      console.log('Searching for videos in test-video directory');
      const files = fs.readdirSync(testFilesDir);
      
      for (const file of files) {
        const filePath = path.join(testFilesDir, file);
        if (fs.statSync(filePath).isFile() && 
            ['.mp4', '.mov', '.webm', '.avi'].includes(path.extname(filePath).toLowerCase())) {
          testVideoPath = filePath;
          testVideoFound = true;
          console.log(`Found test video: ${testVideoPath}`);
          break;
        }
      }
    }
    
    // If no test video found, report and exit
    if (!testVideoFound) {
      console.log('No test videos found in uploads or test-video directories');
      return;
    }
    
    // Prepare a unique test output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(uploadsDir, `test-poster-${timestamp}${path.extname(testVideoPath)}`);
    const relativeOutputPath = `/uploads/test-poster-${timestamp}${path.extname(testVideoPath)}`;
    
    // Copy the test file to the output path (to simulate upload)
    fs.copyFileSync(testVideoPath, outputPath);
    console.log(`Copied test video to: ${outputPath}`);
    
    // Use the spartaStorage to process the file
    const result = await spartaStorage.storeFile(
      outputPath, 
      path.basename(outputPath), 
      'video/mp4', 
      true  // isVideo flag
    );
    
    console.log('File storage result:', result);
    
    // Create a temporary post with this video to test the fix poster script
    console.log('Creating temporary post with this video to test poster generation');
    try {
      // Create a temporary post in the database
      const testPost = await db.insert(posts).values({
        type: 'memory_verse',
        content: 'This is a test post for poster generation',
        userId: 1, // Use a valid user ID or adjust as needed
        is_video: true,
        mediaUrl: result.url,
        points: 10 // Memory verse posts are worth 10 points
      }).returning();
      
      console.log('Created temporary post:', testPost);
      
      // Run the fixVideoPosters function
      console.log('Running fixVideoPosters function...');
      await fixVideoPosters();
      
      // Check if the poster file was created
      const posterFilename = `${path.basename(outputPath, path.extname(outputPath))}.poster.jpg`;
      const posterPath = path.join(path.dirname(outputPath), posterFilename);
      
      // Wait a little bit for the poster to be created asynchronously
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (fs.existsSync(posterPath)) {
        console.log(`SUCCESS: Poster file was created at ${posterPath}`);
        
        // Check the file size to ensure it's a valid image
        const posterFileSize = fs.statSync(posterPath).size;
        console.log(`Poster file size: ${posterFileSize} bytes`);
        
        if (posterFileSize > 0) {
          console.log('Poster file has valid content');
          
          // Get more information about the poster file
          const { stdout } = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
            require('child_process').exec(`file ${posterPath}`, (error: Error | null, stdout: string, stderr: string) => {
              if (error) reject(error);
              else resolve({ stdout, stderr });
            });
          });
          
          console.log(`Poster file details: ${stdout.trim()}`);
        } else {
          console.log('WARNING: Poster file is empty');
        }
      } else {
        console.log(`FAILURE: Poster file was not created at ${posterPath}`);
        
        // List all files in the directory to check what might be there
        console.log('Files in directory:');
        console.log(fs.readdirSync(path.dirname(outputPath)).join('\n'));
      }
      
      // Clean up the temporary post
      if (testPost && testPost.length > 0) {
        await db.delete(posts).where(eq(posts.id, testPost[0].id));
        console.log(`Deleted temporary post with ID: ${testPost[0].id}`);
      }
    } catch (dbError) {
      console.error('Database error during test:', dbError);
    }
    
    // Clean up test files
    try {
      fs.unlinkSync(outputPath);
      const posterPath = path.join(path.dirname(outputPath), 
        `${path.basename(outputPath, path.extname(outputPath))}.poster.jpg`);
      
      if (fs.existsSync(posterPath)) {
        fs.unlinkSync(posterPath);
      }
      console.log('Test files cleaned up');
    } catch (cleanupError) {
      console.error('Error cleaning up test files:', cleanupError);
    }
    
  } catch (error) {
    console.error('Error in poster test:', error);
  }
}

// Run the test immediately since ES modules are always run directly
testPosterFileGeneration()
  .then(() => {
    console.log('Poster file generation test completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error during poster file test:', err);
    process.exit(1);
  });