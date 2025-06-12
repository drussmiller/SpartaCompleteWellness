/**
 * Direct Object Storage API test to identify the exact issue
 */

import { Client } from '@replit/object-storage';
import fs from 'fs';

async function testDirectObjectStorage() {
  console.log('Testing direct Object Storage API...');
  
  try {
    // Initialize client exactly like the working debug test
    const objectStorage = new Client();
    console.log('✓ Object Storage client initialized');
    
    // Create a small test buffer
    const testKey = `direct-test-${Date.now()}.txt`;
    const testContent = Buffer.from('Direct test content');
    
    console.log(`Uploading with key: ${testKey}`);
    console.log('Content size:', testContent.length, 'bytes');
    
    // Add timeout to the upload operation
    const uploadPromise = objectStorage.uploadFromBytes(testKey, testContent);
    
    // Race the upload against a timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Upload timed out after 10 seconds')), 10000);
    });
    
    const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
    console.log('Upload result:', JSON.stringify(uploadResult, null, 2));
    
    // Test immediate download
    console.log('Testing immediate download...');
    const downloadResult = await objectStorage.downloadAsBytes(testKey);
    console.log('Download successful, size:', downloadResult.length);
    
    console.log('✓ Direct Object Storage test completed successfully');
    
  } catch (error) {
    console.error('Direct Object Storage test failed:', error.message);
    console.error('Error details:', error);
  }
}

testDirectObjectStorage();