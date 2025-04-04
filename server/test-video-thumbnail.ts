import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

/**
 * Test function for video thumbnail generation
 * This script can be used to debug issues with video thumbnail creation
 */
async function testVideoThumbnail() {
  console.log('Starting video thumbnail test...');
  
  try {
    // Create a test video directory if it doesn't exist
    const testDir = path.join(process.cwd(), 'test-video');
    const thumbnailDir = path.join(testDir, 'thumbnails');
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
      console.log(`Created test directory: ${testDir}`);
    }
    
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
      console.log(`Created thumbnail directory: ${thumbnailDir}`);
    }
    
    // Let's try to use a real MP4 file if it exists in the uploads directory
    let foundVideoPath = '';
    console.log('Looking for existing MP4 videos in uploads directory...');
    
    const uploadsDir = path.join(process.cwd(), '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (file.endsWith('.mp4')) {
          foundVideoPath = path.join(uploadsDir, file);
          console.log(`Found existing MP4 video: ${foundVideoPath}`);
          break;
        }
      }
    }
    
    // Use the found video or create a test file
    let testVideoPath;
    let svgVideoPath = '';
    
    if (foundVideoPath) {
      testVideoPath = foundVideoPath;
      console.log(`Using existing video: ${testVideoPath}`);
    } else {
      // Create a simple test SVG file that looks like a video frame with play button
      svgVideoPath = path.join(testDir, 'test-video.svg');
      const svgContent = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="blue"/>
        <text x="50%" y="50%" fill="white" text-anchor="middle" font-size="24">Test Video Frame</text>
        <circle cx="320" cy="240" r="50" stroke="white" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
        <polygon points="310,220 310,260 340,240" fill="white"/>
      </svg>`;
      
      fs.writeFileSync(svgVideoPath, svgContent);
      console.log(`Created test SVG video representation at ${svgVideoPath}`);
      testVideoPath = svgVideoPath;
    }
    
    // Try to create thumbnail using the class method logic
    const targetPath = path.join(thumbnailDir, 'test-thumbnail.jpg');
    
    // Create a fallback thumbnail
    const fallbackSvg = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#000"/>
      <text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text>
      <circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
      <polygon points="290,180 290,220 320,200" fill="#fff"/>
    </svg>`;
    
    fs.writeFileSync(targetPath, fallbackSvg);
    console.log(`Created fallback thumbnail at ${targetPath}`);
    
    // Check file permissions
    const ffmpegPath = '/nix/store/3zc5jbvqzrn8zmva4fx5p0nh4yy03wk4-ffmpeg-6.1.1-bin/bin/ffmpeg';
    console.log(`ffmpeg executable exists: ${fs.existsSync(ffmpegPath)}`);
    
    if (fs.existsSync(ffmpegPath)) {
      const stats = fs.statSync(ffmpegPath);
      console.log(`ffmpeg executable permissions: ${stats.mode.toString(8)}`);
    }
    
    // Test direct ffmpeg command
    console.log('Testing ffmpeg command...');
    const videoFullPath = path.resolve(testVideoPath);
    const thumbnailFullPath = path.resolve(targetPath);
    
    console.log(`Using paths for test: 
      - Video: ${videoFullPath}
      - Thumbnail: ${thumbnailFullPath}
    `);
    
    // Check if our test file exists
    console.log(`Test file exists: ${fs.existsSync(videoFullPath)}`);
    
    // Print the ffmpeg command that would run (for debugging)
    console.log(`ffmpeg command would be something like: ffmpeg -i ${videoFullPath} -ss 00:00:01.000 -vframes 1 -vf scale=600:-1 ${thumbnailFullPath}`);
    
    // Test if we can load and use the ffmpeg module
    console.log('ffmpeg module imported successfully');
    
    // Try to actually use ffmpeg to generate a thumbnail
    console.log('Attempting to generate thumbnail with ffmpeg...');
    
    // Return a promise that resolves when ffmpeg finishes
    return new Promise((resolve, reject) => {
      const actualTestPath = path.join(thumbnailDir, 'actual-test-thumbnail.jpg');
      
      try {
        ffmpeg(videoFullPath)
          .on('error', (err: Error | undefined) => {
            console.error(`ffmpeg error: ${err ? err.message : 'Unknown error'}`);
            resolve({
              testDir,
              testVideoPath,
              targetPath,
              actualTestPath,
              fileExists: fs.existsSync(testVideoPath),
              thumbnailExists: fs.existsSync(targetPath),
              ffmpegSuccess: false,
              ffmpegError: err ? err.message : 'Unknown error'
            });
          })
          .on('end', () => {
            console.log(`ffmpeg successfully generated thumbnail at ${actualTestPath}`);
            resolve({
              testDir,
              testVideoPath,
              targetPath,
              actualTestPath,
              fileExists: fs.existsSync(testVideoPath),
              thumbnailExists: fs.existsSync(targetPath),
              ffmpegSuccess: fs.existsSync(actualTestPath),
              ffmpegThumbnailExists: fs.existsSync(actualTestPath)
            });
          })
          .screenshots({
            timestamps: ['00:00:01.000'],
            filename: path.basename(actualTestPath),
            folder: thumbnailDir,
            size: '600x?'
          });
        
        console.log('ffmpeg command initiated');
      } catch (ffmpegError) {
        console.error('Error executing ffmpeg:', ffmpegError);
        resolve({
          testDir,
          testVideoPath,
          targetPath,
          actualTestPath,
          fileExists: fs.existsSync(testVideoPath),
          thumbnailExists: fs.existsSync(targetPath),
          ffmpegSuccess: false,
          ffmpegError: ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)
        });
      }
    });
  } catch (error) {
    console.error('Error in test script:', error);
    return { error };
  }
}

// Run the test function
testVideoThumbnail()
  .then(result => {
    console.log('Test complete!');
    console.log(result);
  })
  .catch(error => {
    console.error('Test failed with uncaught error:', error);
  });