// Test script to verify our specific deletion approach
import { Client } from '@replit/object-storage';

async function testDeleteFiles() {
  console.log('Starting focused file deletion test...');
  
  const client = new Client();
  const specificFiles = [
    'shared/uploads/1746539378349-55fe520e.mov',
    'shared/uploads/thumbnails/thumb-1746539378349-55fe520e.jpg'
  ];
  
  console.log('Will only target these files:');
  console.log(specificFiles);
  
  for (const path of specificFiles) {
    console.log(`\nProcessing: ${path}`);
    
    try {
      // First check if exists
      const exists = await client.exists(path);
      console.log(`File exists check: ${exists}`);
      
      // Attempt delete anyway (we've seen 404 errors even when exists returns true)
      try {
        console.log('Attempting deletion...');
        const result = await client.delete(path);
        console.log(`Deletion result:`, result);
        console.log('Consider this a success even if we get a 404 result');
      } catch (err) {
        // Handle 404 errors as success
        if (err.error && err.error.statusCode === 404) {
          console.log('404 Not Found error - file is already gone or never existed');
        } else {
          console.error('Error during deletion:', err);
        }
      }
      
      // Final check
      try {
        const finalCheck = await client.exists(path);
        console.log(`Final exists check: ${finalCheck}`);
        
        if (finalCheck) {
          console.log(`🔴 ATTENTION: File still exists after deletion attempt`);
        } else {
          console.log(`🟢 SUCCESS: File is confirmed deleted or never existed`);
        }
      } catch (err) {
        console.error('Error in final existence check:', err);
      }
    } catch (err) {
      console.error(`General error processing ${path}:`, err);
    }
  }
}

testDeleteFiles()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));