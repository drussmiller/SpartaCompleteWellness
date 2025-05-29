import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';

async function testThumbnailUpload() {
  try {
    console.log('Testing thumbnail upload to Object Storage...');
    
    // Initialize Object Storage client
    const objectStorage = new Client();
    console.log('Object Storage client initialized');
    
    // Test file to upload (create a simple test file)
    const testContent = 'Test thumbnail content';
    const testKey = 'shared/uploads/test-thumbnail.jpg';
    
    console.log(`Attempting to upload test file with key: ${testKey}`);
    
    // Try to upload
    await objectStorage.uploadFromBytes(testKey, Buffer.from(testContent));
    console.log('Test upload successful!');
    
    // Try to download it back
    const result = await objectStorage.downloadAsBytes(testKey);
    console.log('Test download successful!', result.toString());
    
    // Clean up
    await objectStorage.delete(testKey);
    console.log('Test cleanup successful!');
    
  } catch (error) {
    console.error('Error during thumbnail upload test:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
  }
}

testThumbnailUpload();