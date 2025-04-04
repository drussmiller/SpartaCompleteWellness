import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Test function for MOV video thumbnail generation
 * This script can be used to debug issues with MOV video thumbnail creation
 */
async function testMovThumbnail() {
  try {
    // Use paths relative to the project root, not the server directory
    const projectRoot = path.resolve(process.cwd(), '..');
    const testMovSource = path.join(projectRoot, 'uploads', 'test-mov.MOV');
    const testMovDest = path.join(projectRoot, 'uploads', 'thumbnails', 'test-mov-thumb.jpg');
    
    // Log absolute paths to debug
    console.log('Absolute source path:', path.resolve(testMovSource));
    console.log('Current directory:', process.cwd());
    
    console.log('Testing MOV thumbnail generation');
    console.log(`Source: ${testMovSource}`);
    console.log(`Destination: ${testMovDest}`);
    
    // Check if source file exists
    if (!fs.existsSync(testMovSource)) {
      console.error(`Source MOV file does not exist: ${testMovSource}`);
      return;
    }
    
    // Make sure thumbnail directory exists
    const thumbnailDir = path.dirname(testMovDest);
    if (!fs.existsSync(thumbnailDir)) {
      console.log(`Creating thumbnails directory: ${thumbnailDir}`);
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    
    // Log file details
    try {
      const stats = fs.statSync(testMovSource);
      console.log('Source file details:', {
        size: stats.size,
        isFile: stats.isFile(),
        created: stats.birthtime,
        absolutePath: path.resolve(testMovSource)
      });
    } catch (err) {
      console.error('Error getting file stats:', err);
    }
    
    // Create thumbnail
    console.log('Generating thumbnail with ffmpeg...');
    
    return new Promise<void>((resolve, reject) => {
      ffmpeg(testMovSource)
        .on('error', (err) => {
          console.error('Error generating thumbnail:', err?.message || 'Unknown error');
          reject(err);
        })
        .on('end', () => {
          console.log('Thumbnail generated successfully!');
          
          // Verify thumbnail was created
          if (fs.existsSync(testMovDest)) {
            console.log(`Verified thumbnail exists at ${testMovDest}`);
            
            try {
              const thumbStats = fs.statSync(testMovDest);
              console.log('Thumbnail details:', {
                size: thumbStats.size,
                created: thumbStats.birthtime
              });
            } catch (statsErr) {
              console.error('Error getting thumbnail stats:', statsErr);
            }
          } else {
            console.error(`Thumbnail was not created at ${testMovDest}`);
          }
          
          resolve();
        })
        .screenshots({
          timestamps: ['00:00:01.000'], // Take screenshot at 1 second
          filename: path.basename(testMovDest),
          folder: path.dirname(testMovDest),
          size: '600x?', // Width 600px, height auto-calculated to maintain aspect ratio
        });
    });
  } catch (error) {
    console.error('Error in test script:', error);
  }
}

// Run the test
testMovThumbnail().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Test failed:', err);
});