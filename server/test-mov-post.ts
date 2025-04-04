import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { spartaStorage } from './sparta-object-storage';

/**
 * Test script to simulate post creation with a MOV file
 * This tests the integration between our route handler and SpartaObjectStorage
 */
async function testMovPostCreation() {
  try {
    console.log('Testing MOV file handling in post creation');

    // Path to our test MOV file
    const projectRoot = path.resolve(process.cwd(), '..');
    const testMovSource = path.join(projectRoot, 'uploads', 'test-mov.MOV');

    // Simulate file object from multer
    const mockFile = {
      originalname: `test-${uuidv4()}.MOV`,
      path: testMovSource,
      mimetype: 'application/octet-stream', // Intentionally use generic mimetype to test detection
      size: fs.statSync(testMovSource).size
    };

    console.log('Mock file:', mockFile);

    // Simulate route handler isVideo detection logic
    const originalFilename = mockFile.originalname.toLowerCase();
    const isVideo = mockFile.mimetype.startsWith('video/') || 
                  originalFilename.endsWith('.mov') || 
                  originalFilename.endsWith('.mp4') ||
                  originalFilename.endsWith('.webm');

    console.log('isVideo detection result:', isVideo);

    // Test storing the file
    console.log('Calling spartaStorage.storeFile...');
    const fileInfo = await spartaStorage.storeFile(
      mockFile.path,
      mockFile.originalname,
      mockFile.mimetype,
      isVideo
    );

    console.log('File stored successfully:', fileInfo);
    console.log('Video thumbnail URL:', fileInfo.thumbnailUrl);
    
    // Test that the thumbnail exists
    if (fileInfo.thumbnailUrl) {
      const thumbnailPath = path.join(projectRoot, fileInfo.thumbnailUrl.substring(1)); // Remove leading slash
      console.log('Checking thumbnail at path:', thumbnailPath);
      
      if (fs.existsSync(thumbnailPath)) {
        console.log('Thumbnail exists with size:', fs.statSync(thumbnailPath).size);
      } else {
        console.error('Thumbnail does not exist at expected path');
      }
    } else {
      console.error('No thumbnail URL returned');
    }

    return fileInfo;
  } catch (error) {
    console.error('Error in test script:', error);
    throw error;
  }
}

// Run the test
testMovPostCreation().then((fileInfo) => {
  console.log('Test completed successfully', fileInfo?.url);
}).catch(err => {
  console.error('Test failed:', err);
});