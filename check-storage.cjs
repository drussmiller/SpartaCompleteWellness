/**
 * Script to check Object Storage for specific files
 * Run with: node check-storage.cjs
 */

async function main() {
  try {
    console.log('Loading @replit/object-storage module...');
    const ObjectStorage = require('@replit/object-storage');
    
    console.log('Module contents:', Object.keys(ObjectStorage));
    
    if (!ObjectStorage.Client) {
      console.error('ERROR: ObjectStorage.Client is undefined!');
      return;
    }
    
    console.log('Creating ObjectStorageClient...');
    const ObjectStorageClient = ObjectStorage.Client;
    const client = new ObjectStorageClient();
    
    // Try to list 10 keys to verify the module is working
    console.log('\nListing first 10 keys:');
    try {
      const keys = await client.list({ limit: 10 });
      if (keys && keys.length > 0) {
        keys.forEach((key, i) => console.log(`${i+1}. ${key}`));
      } else {
        console.log('No keys found in storage');
      }
    } catch (err) {
      console.error('Error listing keys:', err);
    }
    
    // Check for specific file we need
    const fileKey = 'uploads/1746156624142-b3ece212.jpeg';
    const sharedKey = 'shared/uploads/1746156624142-b3ece212.jpeg';
    
    console.log(`\nChecking if ${fileKey} exists...`);
    try {
      const exists1 = await client.exists(fileKey);
      console.log(`Key ${fileKey} exists: ${exists1}`);
      
      if (exists1) {
        // Log available methods
        console.log('Available methods on client:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
        
        // Try different methods
        try {
          if (typeof client.get === 'function') {
            const content = await client.get(fileKey);
            console.log(`Retrieved with get(): ${content ? 'Yes' : 'No'}`);
          } else {
            console.log('get() method not available');
          }
          
          if (typeof client.read === 'function') {
            const content = await client.read(fileKey);
            console.log(`Retrieved with read(): ${content ? 'Yes' : 'No'}`);
          } else {
            console.log('read() method not available');
          }
          
          if (typeof client.getBuffer === 'function') {
            const content = await client.getBuffer(fileKey);
            console.log(`Retrieved with getBuffer(): ${content ? 'Yes, size=' + content.length : 'No'}`);
          } else {
            console.log('getBuffer() method not available');
          }
        } catch (err) {
          console.error('Error retrieving content:', err);
        }
      }
    } catch (err) {
      console.error(`Error checking existence of ${fileKey}:`, err);
    }
    
    console.log(`\nChecking if ${sharedKey} exists...`);
    try {
      const exists2 = await client.exists(sharedKey);
      console.log(`Key ${sharedKey} exists: ${exists2}`);
      
      if (exists2) {
        console.log('Trying to retrieve content...');
        try {
          const content = await client.get(sharedKey);
          console.log(`Retrieved content: ${content ? 'Yes, starts with ' + content.substring(0, 20) + '...' : 'No'}`);
        } catch (err) {
          console.error('Error getting content:', err);
        }
      }
    } catch (err) {
      console.error(`Error checking existence of ${sharedKey}:`, err);
    }
    
    // Try to search for files with similar names
    console.log('\nLooking for files containing "1746156624142":');
    try {
      const allKeys = await client.list();
      const matchingKeys = allKeys.filter(key => key.includes('1746156624142'));
      
      if (matchingKeys.length > 0) {
        matchingKeys.forEach(key => console.log(` - ${key}`));
      } else {
        console.log('No matching keys found');
      }
    } catch (err) {
      console.error('Error searching for keys:', err);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();