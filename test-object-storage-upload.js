/**
 * Test script to verify Object Storage upload functionality
 * This tests the new sparta-object-storage-final implementation
 */

import { spartaObjectStorage } from './server/sparta-object-storage-final.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testObjectStorageUpload() {
  console.log('Testing Object Storage upload functionality...');
  
  try {
    // Test with a small image file
    const testImagePath = path.join(__dirname, 'attached_assets', 'sparta_circle_red.png');
    
    if (!fs.existsSync(testImagePath)) {
      console.error('Test image not found at:', testImagePath);
      return;
    }
    
    console.log('Reading test image:', testImagePath);
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log('Image buffer size:', imageBuffer.length, 'bytes');
    
    // Test 1: Basic image upload
    console.log('\n--- Test 1: Basic Image Upload ---');
    const result1 = await spartaObjectStorage.storeFile(
      imageBuffer,
      'test-upload-image.png',
      'image/png',
      false
    );
    console.log('Upload result:', result1);
    
    // Test 2: Check if file exists
    console.log('\n--- Test 2: File Existence Check ---');
    const exists = await spartaObjectStorage.fileExists(result1);
    console.log('File exists:', exists);
    
    // Test 3: Download the file
    console.log('\n--- Test 3: File Download ---');
    try {
      const downloadedBuffer = await spartaObjectStorage.downloadFile(result1);
      console.log('Downloaded buffer size:', downloadedBuffer.length, 'bytes');
      console.log('Original vs downloaded size match:', imageBuffer.length === downloadedBuffer.length);
    } catch (downloadError) {
      console.error('Download test failed:', downloadError.message);
    }
    
    // Test 4: List files
    console.log('\n--- Test 4: List Files ---');
    const files = await spartaObjectStorage.listFiles('shared/uploads');
    console.log('Found files in shared/uploads:', files.length);
    console.log('Sample files:', files.slice(0, 5));
    
    console.log('\n✅ Object Storage tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Object Storage test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testObjectStorageUpload().then(() => {
  console.log('Test execution finished');
  process.exit(0);
}).catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});