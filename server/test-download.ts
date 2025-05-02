/**
 * Test script to verify Object Storage downloadAsBytes method
 * This test confirms that image files can be properly retrieved using the downloadAsBytes method
 */
import { Client } from '@replit/object-storage';

async function testObjectStorageDownload() {
  try {
    console.log("Starting Object Storage download test...");
    
    // Create a new Object Storage client
    const objectStorage = new Client();
    
    // Test keys - try both environment-specific and shared paths
    const testKeys = [
      'uploads/sparta_circle_red.png',
      'shared/uploads/sparta_circle_red.png',
      'uploads/Sparta_Logo.jpg',
      'shared/uploads/Sparta_Logo.jpg',
      'uploads/test-image.jpg',
      'shared/uploads/test-image.jpg'
    ];
    
    // Test the existence and downloading of each key
    for (const key of testKeys) {
      console.log(`\n===== TESTING KEY: ${key} =====`);
      
      const exists = await objectStorage.exists(key);
      console.log(`  Exists check result: ${JSON.stringify(exists)}`);
      
      // Attempt download regardless of exists check to test both paths
      try {
        // Test downloadAsBytes
        console.log(`  Attempting to download using downloadAsBytes...`);
        console.log(`  DEBUG: Attempting to download key: ${key}`);
        const result = await objectStorage.downloadAsBytes(key);
        console.log(`  DEBUG: Download result type: ${typeof result}`);
        
        // Check if result exists and determine its format
        if (result) {
          if (result.constructor === Buffer) {
            console.log(`  SUCCESS: Downloaded as Buffer, size: ${result.length} bytes`);
          } else if (typeof result === 'object') {
            // If it's an object with ok property
            if ('ok' in result) {
              console.log(`  RESULT OBJECT: ${JSON.stringify(result)}`);
              
              if (result.ok === true && result.value) {
                // For successful results with a value
                console.log(`  SUCCESS: Downloaded with result object, value type: ${typeof result.value}`);
                if (Buffer.isBuffer(result.value)) {
                  console.log(`  SUCCESS: Value is a Buffer, size: ${result.value.length} bytes`);
                }
              } else {
                // For error results
                console.log(`  ERROR RESPONSE: ${JSON.stringify(result.error || 'Unknown error')}`);
              }
            } else {
              console.log(`  UNKNOWN OBJECT FORMAT: ${JSON.stringify(result)}`);
            }
          } else {
            console.log(`  UNKNOWN RESULT TYPE: ${typeof result}`);
          }
        } else {
          console.log(`  WARNING: Result is null or undefined`);
        }
      } catch (downloadError) {
        console.error(`  ERROR: Failed to download file using downloadAsBytes:`, downloadError);
      }
      
      console.log("=============================");
    }
    
    console.log("Object Storage download test completed.");
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

// Run the test function
testObjectStorageDownload().catch(console.error);