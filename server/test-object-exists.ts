/**
 * Test script to verify if files exist in Replit Object Storage
 * This script checks both regular and shared paths for the given file
 */
import { Client } from '@replit/object-storage';

async function testObjectExists() {
  console.log("===== Object Storage Exists Test =====");
  
  const objectStorage = new Client();
  
  // Get file paths from command line args
  const filenames = process.argv.slice(2);
  
  if (filenames.length === 0) {
    console.log("Please provide filenames to check as command line arguments");
    console.log("Example: tsx server/test-object-exists.ts 1746189789178-258db354.jpeg");
    return;
  }
  
  for (const filename of filenames) {
    console.log(`\nChecking file: ${filename}`);
    
    // Different path formats to check
    const paths = [
      `uploads/${filename}`,
      `shared/uploads/${filename}`,
      // Try with and without leading slashes
      `/uploads/${filename}`,
      `/shared/uploads/${filename}`
    ];
    
    for (const path of paths) {
      try {
        const existsResult = await objectStorage.exists(path);
        const exists = typeof existsResult === 'object' && existsResult !== null && 'ok' in existsResult 
          ? existsResult.ok 
          : existsResult;
        console.log(`Path: ${path} - Exists (raw): ${JSON.stringify(existsResult)}`);
        console.log(`Path: ${path} - Exists (parsed): ${exists}`);
        
        if (exists) {
          // Get detailed info about the object
          console.log(`Getting metadata for: ${path}`);
          try {
            // List the directory to get metadata
            const prefix = path.substring(0, path.lastIndexOf('/') + 1);
            const listResult = await objectStorage.list({ prefix });
            
            console.log(`  - List result: ${JSON.stringify(listResult)}`);
            
            // Check if listResult is an object with ok property
            if (typeof listResult === 'object' && listResult !== null && 'ok' in listResult) {
              if (listResult.ok && Array.isArray(listResult.value)) {
                const files = listResult.value;
                // Find the matching file
                const file = files.find((f: any) => f.key === path);
                if (file) {
                  console.log(`  - Size: ${file.size} bytes`);
                  console.log(`  - Last modified: ${file.lastModified}`);
                } else {
                  console.log(`  - File found with exists() but not found in list() results`);
                  console.log(`  - Available files: ${files.map((f: any) => f.key).join(', ')}`);
                }
              } else {
                console.log(`  - List operation failed: ${listResult.error}`);
              }
            } else if (Array.isArray(listResult)) {
              // Handle direct array response
              const files = listResult;
              const file = files.find((f: any) => f.key === path);
              if (file) {
                console.log(`  - Size: ${file.size} bytes`);
                console.log(`  - Last modified: ${file.lastModified}`);
              } else {
                console.log(`  - File found with exists() but not found in list() results`);
                console.log(`  - Available files: ${files.map((f: any) => f.key).join(', ')}`);
              }
            } else {
              console.log(`  - Unexpected list result format: ${typeof listResult}`);
            }
          } catch (metaError) {
            console.error(`  - Error getting metadata: ${metaError.message}`);
          }
        }
      } catch (error) {
        console.error(`Error checking ${path}: ${error.message}`);
      }
    }
  }
}

// Run the test
testObjectExists().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});