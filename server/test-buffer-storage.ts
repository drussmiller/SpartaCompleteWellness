/**
 * Test utility for our new storeBuffer method
 * This script tests storing a buffer directly using spartaStorage
 */
import fs from 'fs';
import path from 'path';
import { spartaStorage } from './sparta-object-storage';
import { logger } from './logger';

async function testBufferStorage() {
  try {
    // Create a test buffer (a simple JPG)
    const sampleJpgPath = path.join(process.cwd(), 'attached_assets', 'SupportSparta.png');
    console.log(`Reading sample image from ${sampleJpgPath}`);
    
    // Ensure the file exists
    if (!fs.existsSync(sampleJpgPath)) {
      throw new Error(`Sample image not found at ${sampleJpgPath}`);
    }
    
    // Read the file into a buffer
    const imageBuffer = fs.readFileSync(sampleJpgPath);
    console.log(`Read image buffer of size ${imageBuffer.length} bytes`);
    
    // Test buffer storage with various filenames
    const tests = [
      { filename: 'test-buffer-storage.jpg', mimeType: 'image/jpeg' },
      { filename: 'memory-verse-test.poster.jpg', mimeType: 'image/jpeg' },
      { filename: 'thumbnails/memory-verse-test.jpg', mimeType: 'image/jpeg' },
      { filename: 'thumbnails/memory-verse-test.poster.jpg', mimeType: 'image/jpeg' }
    ];
    
    const results = [];
    
    for (const test of tests) {
      console.log(`Testing storeBuffer with ${test.filename}`);
      
      try {
        const url = await spartaStorage.storeBuffer(
          imageBuffer,
          test.filename,
          test.mimeType
        );
        
        console.log(`Successfully stored buffer as ${test.filename}, URL: ${url}`);
        
        // Verify the file exists locally
        const localPath = path.join(process.cwd(), 'uploads', test.filename);
        const exists = fs.existsSync(localPath);
        
        results.push({
          filename: test.filename,
          success: true,
          url,
          localExists: exists,
          localPath
        });
      } catch (error) {
        console.error(`Error storing buffer as ${test.filename}:`, error);
        
        results.push({
          filename: test.filename,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log('Buffer storage test results:');
    console.table(results);
    
    return results;
  } catch (error) {
    logger.error('Error in buffer storage test:', error);
    console.error('Buffer storage test failed:', error);
    throw error;
  }
}

// Run the test immediately in ES module context
testBufferStorage()
  .then(results => {
    console.log('Buffer storage test completed successfully');
  })
  .catch(error => {
    console.error('Buffer storage test failed:', error);
    process.exit(1);
  });

export { testBufferStorage };