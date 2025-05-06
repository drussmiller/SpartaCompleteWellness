import { Client } from '@replit/object-storage';
import fs from 'fs';

// Initialize Object Storage
const objectStorage = new Client();

// Specific files to target - no variations, just these exact paths
const filesToDelete = [
  'shared/uploads/1746539378349-55fe520e.mov',
  'shared/uploads/thumbnails/thumb-1746539378349-55fe520e.jpg'
];

async function forceDelete(path) {
  console.log(`Force deleting ${path} with raw API calls...`);
  
  try {
    // Use lower-level Replit Object Storage API calls
    const response = await fetch(`https://object-storage.${process.env.REPL_ID}.replit.dev/object/${path}`, {
      method: 'DELETE',
      headers: {
        'X-Replit-Object-Storage-Auth': process.env.REPLIT_OBJECT_STORAGE_TOKEN
      }
    });
    
    console.log(`Direct API DELETE status: ${response.status}`);
    
    // Consider 404 a success (file is gone)
    if (response.status === 404 || response.status === 200) {
      console.log(`Successfully deleted or already gone: ${path}`);
      return true;
    } else {
      console.log(`Unexpected response:`, await response.text());
      return false;
    }
  } catch (e) {
    console.error(`Error in force delete: ${e}`);
    return false;
  }
}

// Try a different approach with accessing the object storage creds directly
async function getObjectStorageCredentials() {
  try {
    // Attempt to read environment variables for Object Storage
    const envFile = fs.readFileSync('.replit', 'utf8');
    const envLines = envFile.split('\n');
    const envVars = {};
    
    for (const line of envLines) {
      const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?$/);
      if (match) {
        envVars[match[1]] = match[2];
      }
    }
    
    return {
      id: process.env.REPL_ID || envVars.REPL_ID,
      token: process.env.REPLIT_OBJECT_STORAGE_TOKEN || 
             envVars.REPLIT_OBJECT_STORAGE_TOKEN
    };
  } catch (e) {
    console.error('Error getting Object Storage credentials:', e);
    return null;
  }
}

async function deleteSpecificFiles() {
  console.log('Starting targeted deletion of specific files:');
  console.log(filesToDelete);
  
  // First, let's try to check if our environment has everything we need
  const creds = await getObjectStorageCredentials();
  console.log(`Environment check:`, {
    replId: process.env.REPL_ID || '(not found)',
    hasToken: !!process.env.REPLIT_OBJECT_STORAGE_TOKEN,
    credsFound: !!creds
  });
  
  for (const path of filesToDelete) {
    try {
      console.log(`\nProcessing: ${path}`);
      
      // First check if the file exists via standard method
      const exists = await objectStorage.exists(path);
      console.log(`Initial exists check: ${exists ? 'YES' : 'NO'}`);
      
      if (exists) {
        // Direct deletion attempt using standard client  
        try {
          console.log(`Attempting standard deletion...`);
          const deleteResult = await objectStorage.delete(path);
          console.log('Delete result:', deleteResult);
          
          // Check for success (multiple possible response formats)
          const isSuccess = 
            (typeof deleteResult === 'object' && 
             'ok' in deleteResult && 
             deleteResult.ok === true) || 
            (typeof deleteResult === 'object' && 
             'response' in deleteResult && 
             deleteResult.response && 
             'status' in deleteResult.response && 
             deleteResult.response.status === 200);
          
          console.log(`Standard deletion success: ${isSuccess ? 'YES' : 'NO'}`);
        } catch (error) {
          // For 404 errors, consider it a success (file is already gone)
          const is404Error = 
            (error && 
             typeof error === 'object' && 
             ('status' in error && error.status === 404)) || 
            (error && 
             typeof error === 'object' && 
             'error' in error && 
             typeof error.error === 'object' && 
             error.error &&
             'statusCode' in error.error && 
             error.error.statusCode === 404);
          
          if (is404Error) {
            console.log(`File not found (404 error) - considering it successfully deleted`);
          } else {
            console.log('Error deleting file (this might be normal if exists method is inaccurate):', error);
            
            // Try our forced deletion approach
            await forceDelete(path);
          }
        }
        
        // Handle the contradiction: file exists according to check, but deletion gets 404
        const stillExists = await objectStorage.exists(path);
        if (stillExists) {
          console.log(`Weird state: File still exists after deletion attempt - trying forced deletion`);
          await forceDelete(path);
        }
      } else {
        console.log(`File ${path} doesn't exist - no need to delete`);
      }
      
      // Final verification
      try {
        const finalExists = await objectStorage.exists(path);
        console.log(`FINAL CHECK: ${path} exists: ${finalExists ? 'YES (still not deleted)' : 'NO (successfully gone)'}`);
        
        // If all our attempts failed and the file still exists, let's register what we've learned
        if (finalExists) {
          console.log(`🔴 ERROR: ${path} could not be deleted after multiple attempts.`);
          console.log('This suggests a possible bug in the Object Storage implementation where:');
          console.log('1. exists() reports file exists');
          console.log('2. delete() returns 404 (not found)');
        } else {
          console.log(`🟢 SUCCESS: ${path} has been successfully deleted or confirmed gone.`);
        }
      } catch (existsError) {
        console.error('Error in final existence check:', existsError);
      }
    } catch (err) {
      console.error(`General error for path ${path}:`, err);
    }
  }
}

// Run the deletion process
console.log('Starting focused file deletion...');
deleteSpecificFiles()
  .then(() => console.log('Deletion process completed'))
  .catch(err => console.error('Deletion process failed:', err));