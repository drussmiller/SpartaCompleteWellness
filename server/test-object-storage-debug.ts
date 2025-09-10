/**
 * Object Storage Debug Test
 * This script performs comprehensive testing of Object Storage operations
 * to identify why uploads appear successful but files don't persist
 */

import { Client } from '@replit/object-storage';

async function debugObjectStorage() {
  console.log('=== Object Storage Debug Test ===');
  
  try {
    // Initialize Object Storage client
    const objectStorage = new Client();
    console.log('✓ Object Storage client initialized');
    
    // Test 1: Basic upload and immediate verification
    console.log('\n--- Test 1: Basic Upload and Verification ---');
    const testKey = `debug-test-${Date.now()}.txt`;
    const testContent = Buffer.from('Debug test content');
    
    console.log(`Uploading file with key: ${testKey}`);
    const uploadResult = await objectStorage.uploadFromBytes(testKey, testContent);
    console.log('Upload result:', JSON.stringify(uploadResult, null, 2));
    
    // Check if upload actually succeeded based on API response
    if (uploadResult && typeof uploadResult === 'object' && 'ok' in uploadResult) {
      if (uploadResult.ok === true) {
        console.log('✓ Upload reported successful (new API format)');
      } else {
        console.log('✗ Upload failed:', uploadResult.error);
        return;
      }
    } else {
      console.log('✓ Upload completed (legacy API format or direct success)');
    }
    
    // Test 2: Immediate download attempt
    console.log('\n--- Test 2: Immediate Download ---');
    try {
      const downloadResult = await objectStorage.downloadAsBytes(testKey);
      console.log('Download result type:', typeof downloadResult);
      console.log('Download result:', JSON.stringify(downloadResult, null, 2));
      
      if (downloadResult && typeof downloadResult === 'object' && 'ok' in downloadResult) {
        if (downloadResult.ok === true && downloadResult.value) {
          console.log('✓ File downloaded successfully');
          console.log('Content match:', Buffer.isBuffer(downloadResult.value) && downloadResult.value.equals(testContent));
        } else {
          console.log('✗ Download failed:', downloadResult.error);
        }
      } else if (Buffer.isBuffer(downloadResult)) {
        console.log('✓ File downloaded (legacy format)');
        console.log('Content match:', downloadResult.equals(testContent));
      } else {
        console.log('✗ Unexpected download result format');
      }
    } catch (downloadError) {
      console.log('✗ Download error:', downloadError);
    }
    
    // Test 3: List files to verify existence
    console.log('\n--- Test 3: List Files ---');
    try {
      const listResult = await objectStorage.list({ prefix: 'debug-test-' });
      console.log('List result:', JSON.stringify(listResult, null, 2));
      
      if (listResult && typeof listResult === 'object' && 'ok' in listResult) {
        if (listResult.ok === true) {
          const files = listResult.value || [];
          console.log(`Found ${files.length} debug test files`);
          const ourFile = files.find((file: any) => file === testKey || (file.key && file.key === testKey));
          if (ourFile) {
            console.log('✓ Our test file found in list');
          } else {
            console.log('✗ Our test file NOT found in list');
          }
        } else {
          console.log('✗ List failed:', listResult.error);
        }
      } else if (Array.isArray(listResult)) {
        console.log(`Found ${listResult.length} debug test files (legacy format)`);
        const ourFile = listResult.find((file: any) => file === testKey || (file.key && file.key === testKey));
        if (ourFile) {
          console.log('✓ Our test file found in list');
        } else {
          console.log('✗ Our test file NOT found in list');
        }
      } else {
        console.log('List result (unknown format):', listResult);
      }
    } catch (listError) {
      console.log('✗ List error:', listError);
    }
    
    // Test 4: Wait and check persistence
    console.log('\n--- Test 4: Persistence Check (wait 2 seconds) ---');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const persistenceCheck = await objectStorage.downloadAsBytes(testKey);
      if (persistenceCheck && typeof persistenceCheck === 'object' && 'ok' in persistenceCheck) {
        if (persistenceCheck.ok === true) {
          console.log('✓ File persisted after delay');
        } else {
          console.log('✗ File lost after delay:', persistenceCheck.error);
        }
      } else if (Buffer.isBuffer(persistenceCheck)) {
        console.log('✓ File persisted after delay (legacy format)');
      } else {
        console.log('✗ File lost after delay');
      }
    } catch (persistenceError) {
      console.log('✗ Persistence check failed:', persistenceError);
    }
    
    // Test 5: Test the specific key format used by Sparta
    console.log('\n--- Test 5: Sparta Key Format Test ---');
    const spartaKey = `shared/uploads/debug-sparta-${Date.now()}.mov`;
    const spartaContent = Buffer.from('Sparta debug video content');
    
    console.log(`Testing Sparta key format: ${spartaKey}`);
    try {
      const spartaUpload = await objectStorage.uploadFromBytes(spartaKey, spartaContent);
      console.log('Sparta upload result:', JSON.stringify(spartaUpload, null, 2));
      
      // Immediate download test
      const spartaDownload = await objectStorage.downloadAsBytes(spartaKey);
      console.log('Sparta download result type:', typeof spartaDownload);
      
      if (spartaDownload && typeof spartaDownload === 'object' && 'ok' in spartaDownload) {
        console.log('Sparta file status:', spartaDownload.ok ? 'found' : 'not found');
      } else if (Buffer.isBuffer(spartaDownload)) {
        console.log('✓ Sparta file found (legacy format)');
      } else {
        console.log('✗ Sparta file not found');
      }
    } catch (spartaError) {
      console.log('✗ Sparta test error:', spartaError);
    }
    
    // Clean up test files
    console.log('\n--- Cleanup ---');
    try {
      await objectStorage.delete(testKey);
      await objectStorage.delete(spartaKey);
      console.log('✓ Test files cleaned up');
    } catch (cleanupError) {
      console.log('Cleanup error (non-critical):', cleanupError);
    }
    
  } catch (error) {
    console.error('Object Storage debug test failed:', error);
  }
}

// Run the debug test
debugObjectStorage().then(() => {
  console.log('\n=== Debug Test Complete ===');
}).catch(error => {
  console.error('Debug test crashed:', error);
});