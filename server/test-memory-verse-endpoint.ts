/**
 * Test script for memory verse thumbnail generation endpoint
 * This script makes a direct request to the memory verse thumbnail generation endpoint
 */
import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function testMemoryVerseEndpoint() {
  try {
    // The local server URL
    const baseUrl = 'http://localhost:5000';
    
    // Make a request to the memory verse thumbnail generation endpoint
    console.log('Sending request to the memory verse thumbnail generation endpoint...');
    
    // Ensure we don't throw on non-200 responses
    const response = await axios.get(`${baseUrl}/api/memory-verse-thumbnails-test`, {
      validateStatus: () => true
    });
    
    console.log('Response received:');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    // Check if the response was successful
    if (response.status === 200) {
      console.log('Request was successful!');
      
      // Check the response data
      const data = response.data;
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      // If the response contains results, check them
      if (data.results && Array.isArray(data.results)) {
        console.log(`Processed ${data.results.length} memory verse posts`);
        
        // Count successes and failures
        const successes = data.results.filter((r: any) => r.success).length;
        const failures = data.results.filter((r: any) => !r.success).length;
        
        console.log(`Successes: ${successes}`);
        console.log(`Failures: ${failures}`);
        
        // Check if any generated thumbnail URLs were returned
        const allThumbnailUrls = data.results
          .filter((r: any) => r.thumbnailUrls && r.thumbnailUrls.length > 0)
          .flatMap((r: any) => r.thumbnailUrls);
        
        console.log(`Total thumbnail URLs generated: ${allThumbnailUrls.length}`);
        
        if (allThumbnailUrls.length > 0) {
          console.log('Sample thumbnail URLs:');
          allThumbnailUrls.slice(0, 5).forEach((url: string) => {
            console.log(`- ${url}`);
          });
        }
      }
      
      return data;
    } else {
      console.error('Request failed with status:', response.status);
      throw new Error(`Request failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error testing memory verse endpoint:', error);
    throw error;
  }
}

// Run the test
testMemoryVerseEndpoint()
  .then(() => {
    console.log('Memory verse thumbnail generation test completed successfully');
  })
  .catch(error => {
    console.error('Memory verse thumbnail generation test failed:', error.message);
  });