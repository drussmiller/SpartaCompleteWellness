/**
 * Check Object Storage Script
 * Run with: node check-storage.js
 */

// This will only work in environments where @replit/object-storage exists
async function main() {
  try {
    console.log('Checking for @replit/object-storage module...');
    const ObjectStorageModule = require('@replit/object-storage');
    
    if (!ObjectStorageModule) {
      console.error('Module loaded but is undefined');
      return;
    }
    
    console.log('Module contents:', Object.keys(ObjectStorageModule));
    
    // Try to get the client constructor
    const ObjectStorageClient = ObjectStorageModule.default;
    
    if (!ObjectStorageClient) {
      console.error('ObjectStorageClient constructor not found in module');
      return;
    }
    
    console.log('Initializing client...');
    const client = new ObjectStorageClient();
    
    // Check specific key
    const fileKey = 'uploads/1746156624142-b3ece212.jpeg';
    const sharedKey = 'shared/uploads/1746156624142-b3ece212.jpeg';
    
    console.log(`Checking if ${fileKey} exists...`);
    const exists1 = await client.exists(fileKey);
    console.log(`Key ${fileKey} exists: ${exists1}`);
    
    console.log(`Checking if ${sharedKey} exists...`);
    const exists2 = await client.exists(sharedKey);
    console.log(`Key ${sharedKey} exists: ${exists2}`);
    
    // List first 10 keys to see what's available
    console.log('\nListing first 10 keys:');
    const keys = await client.list({ limit: 10 });
    if (keys.length === 0) {
      console.log('No keys found');
    } else {
      keys.forEach((key, i) => console.log(`${i+1}. ${key}`));
    }
  
  } catch (error) {
    console.error('Error:', error);
  }
}

main();