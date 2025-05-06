// This script will specifically target ONLY the two files mentioned by the user.

import { Client } from '@replit/object-storage';

// Initialize Object Storage client
const client = new Client();

// Very specifically only these two files, no variations
const specificPaths = [
  'shared/uploads/1746539378349-55fe520e.mov',
  'shared/uploads/thumbnails/thumb-1746539378349-55fe520e.jpg'
];

// The main function to delete the files
async function deleteFiles() {
  console.log('Processing exactly these file paths:');
  console.log(specificPaths);
  
  try {
    // Remove the files one by one
    for (const path of specificPaths) {
      console.log(`\nHandling: ${path}`);
      
      try {
        // Try the delete operation directly without a preliminary exists check
        console.log(`Attempting direct deletion...`);
        
        try {
          const result = await client.delete(path);
          console.log(`Deletion result:`, result);
          console.log(`${path} deleted successfully!`);
        } catch (deleteError) {
          // If we get a 404, it means the file is already gone
          if (deleteError && deleteError.error && deleteError.error.statusCode === 404) {
            console.log(`File not found (404) - considering it successfully deleted`);
          } else {
            console.log(`Error deleting ${path}:`, deleteError);
          }
        }
      } catch (error) {
        console.error(`Error processing ${path}:`, error);
      }
    }
  } catch (err) {
    console.error('Error in main deletion process:', err);
  }
}

// Execute the function
console.log('Starting focused deletion...');
deleteFiles()
  .then(() => console.log('Process completed'))
  .catch(err => console.error('Process failed:', err));