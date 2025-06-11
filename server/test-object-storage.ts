/**
 * Test script to check Object Storage state
 * Run with: npx tsx server/test-object-storage.ts
 * This will check if specific files exist in Replit Object Storage
 */

// Using require instead of import
import { Client as ObjectStorageClient } from '@replit/object-storage';

async function testObjectStorage() {
  try {
    console.log('Initializing Object Storage client...');
    const objectStorage = new ObjectStorageClient();
    console.log('Object Storage client initialized successfully');
    
    // Test specific file
    const fileKey = 'uploads/1746156624142-b3ece212.jpeg';
    const sharedFileKey = 'shared/uploads/1746156624142-b3ece212.jpeg';
    
    console.log(`Checking if ${fileKey} exists...`);
    const exists1 = await objectStorage.exists(fileKey);
    console.log(`File ${fileKey} exists in Object Storage: ${exists1}`);
    
    console.log(`Checking if ${sharedFileKey} exists...`);
    const exists2 = await objectStorage.exists(sharedFileKey);
    console.log(`File ${sharedFileKey} exists in Object Storage: ${exists2}`);
    
    // List first 10 keys
    console.log('\nListing first 10 keys in Object Storage:');
    const keys = await objectStorage.list({ limit: 10 });
    
    if (keys.length === 0) {
      console.log('No keys found in Object Storage');
    } else {
      keys.forEach((key, index) => {
        console.log(`${index + 1}. ${key}`);
      });
    }
    
    // Search for files with similar name
    console.log('\nSearching for keys containing "1746156624142":');
    const allKeys = await objectStorage.list();
    const matchingKeys = allKeys.filter(key => key.includes('1746156624142'));
    
    if (matchingKeys.length === 0) {
      console.log('No matching keys found');
    } else {
      matchingKeys.forEach(key => console.log(` - ${key}`));
    }
    
  } catch (error) {
    console.error('Error testing Object Storage:', error);
  }
}

testObjectStorage();