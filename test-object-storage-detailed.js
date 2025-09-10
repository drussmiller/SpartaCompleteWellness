import { Client } from '@replit/object-storage';

async function detailedObjectStorageTest() {
  console.log('=== Detailed Object Storage Test ===');
  
  try {
    // Initialize client
    const client = new Client({
      bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
    });
    
    console.log('✓ Client initialized');
    
    // Test different methods to understand the API
    console.log('\n--- Testing client methods ---');
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    
    // Try to list objects first (less intrusive than upload)
    console.log('\n--- Testing list operation ---');
    try {
      const listResult = await client.list();
      console.log('List result:', listResult);
    } catch (listError) {
      console.log('List error:', {
        message: listError.message,
        stack: listError.stack?.split('\n').slice(0, 5),
        name: listError.name,
        code: listError.code
      });
    }
    
    // Try upload with more detailed error handling
    console.log('\n--- Testing upload with detailed error handling ---');
    const testKey = `detailed-test-${Date.now()}.txt`;
    const testContent = 'Detailed test content';
    
    try {
      console.log('Attempting upload...');
      const uploadResult = await client.uploadFromText(testKey, testContent);
      console.log('Upload succeeded:', uploadResult);
      
      // Try to clean up
      try {
        await client.delete(testKey);
        console.log('✓ Cleanup successful');
      } catch (deleteError) {
        console.log('Delete error (non-critical):', deleteError.message);
      }
      
    } catch (uploadError) {
      console.log('Upload error details:');
      console.log('Type:', typeof uploadError);
      console.log('Constructor:', uploadError.constructor.name);
      console.log('Message:', uploadError.message);
      console.log('Name:', uploadError.name);
      console.log('Code:', uploadError.code);
      console.log('Stack trace:', uploadError.stack?.split('\n').slice(0, 10));
      console.log('All properties:', Object.getOwnPropertyNames(uploadError));
      
      // Try to extract more info
      if (uploadError.response) {
        console.log('Response object:', uploadError.response);
      }
      if (uploadError.request) {
        console.log('Request object exists:', !!uploadError.request);
      }
      
      // Check if it's a network error
      if (uploadError.cause) {
        console.log('Cause:', uploadError.cause);
      }
    }
    
  } catch (generalError) {
    console.log('General error:', generalError);
  }
}

detailedObjectStorageTest().catch(console.error);