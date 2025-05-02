/**
 * Test script to validate Replit Object Storage API handling
 * 
 * This script tests the different response formats from Object Storage
 * and ensures we can correctly handle all of them.
 */

import * as ObjectStorage from "@replit/object-storage";
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Initialize Object Storage Client
const objectStorage = new ObjectStorage.Client({
  bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET || "default-bucket"
});

/**
 * Test Replit Object Storage API
 * This function tests different aspects of the Object Storage API to ensure
 * we're handling responses correctly.
 */
export async function testObjectStorage() {
  const testKey = 'test-key-' + Date.now();
  const testContent = Buffer.from('This is a test file for Replit Object Storage.');
  const results: Record<string, any> = {};
  
  console.log('=== Replit Object Storage API Test ===');
  console.log('Testing with key:', testKey);
  
  try {
    // Step 1: Test exists() before file is created (should be false)
    console.log('\n1. Testing exists() on non-existent file:');
    const existsBefore = await objectStorage.exists(testKey);
    console.log('existsBefore:', existsBefore);
    console.log('Type:', typeof existsBefore);
    console.log('JSON representation:', JSON.stringify(existsBefore));
    results.existsBefore = existsBefore;
    
    // Step 2: Test upload
    console.log('\n2. Testing upload:');
    const uploadResult = await objectStorage.put(testKey, testContent);
    console.log('uploadResult:', uploadResult);
    console.log('Type:', typeof uploadResult);
    console.log('JSON representation:', JSON.stringify(uploadResult));
    results.uploadResult = uploadResult;
    
    // Step 3: Test exists() after file is created (should be true)
    console.log('\n3. Testing exists() on existing file:');
    const existsAfter = await objectStorage.exists(testKey);
    console.log('existsAfter:', existsAfter);
    console.log('Type:', typeof existsAfter);
    console.log('JSON representation:', JSON.stringify(existsAfter));
    results.existsAfter = existsAfter;
    
    // Step 4: Test download
    console.log('\n4. Testing download:');
    const downloadResult = await objectStorage.get(testKey);
    let isBuffer = Buffer.isBuffer(downloadResult);
    let hasOkProperty = false;
    let hasValueProperty = false;
    let innerValue = null;
    
    if (typeof downloadResult === 'object' && downloadResult !== null) {
      hasOkProperty = 'ok' in downloadResult;
      hasValueProperty = 'value' in downloadResult;
      if (hasValueProperty) {
        innerValue = downloadResult.value;
      }
    }
    
    console.log('downloadResult:', downloadResult);
    console.log('Type:', typeof downloadResult);
    console.log('Is Buffer:', isBuffer);
    console.log('Has ok property:', hasOkProperty);
    console.log('Has value property:', hasValueProperty);
    console.log('Inner value type:', innerValue ? typeof innerValue : 'null');
    console.log('Inner value is Buffer:', innerValue ? Buffer.isBuffer(innerValue) : 'N/A');
    
    if (isBuffer) {
      console.log('Buffer content:', downloadResult.toString());
    } else if (innerValue && Buffer.isBuffer(innerValue)) {
      console.log('Inner buffer content:', innerValue.toString());
    }
    
    results.downloadResult = {
      isBuffer,
      hasOkProperty,
      hasValueProperty,
      innerValueType: innerValue ? typeof innerValue : 'null',
      innerValueIsBuffer: innerValue ? Buffer.isBuffer(innerValue) : false
    };
    
    // Step 5: Test delete
    console.log('\n5. Testing delete:');
    const deleteResult = await objectStorage.delete(testKey);
    console.log('deleteResult:', deleteResult);
    console.log('Type:', typeof deleteResult);
    console.log('JSON representation:', JSON.stringify(deleteResult));
    results.deleteResult = deleteResult;
    
    // Step 6: Final exists() check after deletion (should be false)
    console.log('\n6. Testing exists() after deletion:');
    const existsAfterDelete = await objectStorage.exists(testKey);
    console.log('existsAfterDelete:', existsAfterDelete);
    console.log('Type:', typeof existsAfterDelete);
    console.log('JSON representation:', JSON.stringify(existsAfterDelete));
    results.existsAfterDelete = existsAfterDelete;
    
    console.log('\n=== Test Complete ===');
    console.log('Results summary:', results);
    
    // Save results to a file for reference
    const outputPath = 'object-storage-test-results.json';
    try {
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`Test results saved to ${outputPath}`);
    } catch (saveError) {
      console.error('Error saving test results:', saveError);
    }
    
    return results;
  } catch (error) {
    console.error('Error during Object Storage test:', error);
    results.error = error instanceof Error ? error.message : String(error);
    return results;
  }
}

// Execute test if this file is run directly
if (require.main === module) {
  testObjectStorage()
    .then(() => console.log('Test executed'))
    .catch(error => console.error('Test failed:', error));
}

export default testObjectStorage;