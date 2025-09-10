import { createMovThumbnail } from './server/mov-frame-extractor-new.js';
import { spartaStorage } from './server/sparta-object-storage.js';
import fs from 'fs';

async function testExistingVideoThumbnail() {
  try {
    const videoFilename = '1748544575422-d6c8296e-5797-4788-bb87-b18401e332e2-IMG_7923.MOV';
    const expectedThumbnail = '1748544575422-d6c8296e-5797-4788-bb87-b18401e332e2-IMG_7923.jpg';
    
    console.log(`Testing thumbnail creation for existing video: ${videoFilename}`);
    
    // Check if video exists in Object Storage
    try {
      const videoInfo = await spartaStorage.getFileInfo(`/api/serve-file?filename=${videoFilename}`);
      console.log('Video exists in storage:', !!videoInfo);
    } catch (error) {
      console.log('Video file check failed:', error.message);
    }

    // Check if thumbnail already exists
    try {
      const thumbnailInfo = await spartaStorage.getFileInfo(`/api/serve-file?filename=${expectedThumbnail}`);
      console.log('Thumbnail already exists:', !!thumbnailInfo);
      return;
    } catch (error) {
      console.log('Thumbnail does not exist, proceeding to create...');
    }

    // Create local directory
    const uploadsDir = './uploads';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Download video file locally first 
    console.log('Need to download video file to create thumbnail...');
    
  } catch (error) {
    console.error('Error during thumbnail test:', error);
  }
}

testExistingVideoThumbnail();