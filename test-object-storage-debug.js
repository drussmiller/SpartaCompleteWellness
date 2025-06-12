import { Client } from '@replit/object-storage';

async function debugObjectStorage() {
  console.log('=== Object Storage Debug Test ===');
  
  try {
    // Test 1: Initialize client with bucket ID only
    console.log('\n1. Testing client initialization with bucket ID...');
    const client = new Client({
      bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
    });
    console.log('✓ Client initialized successfully');
    
    // Test 2: Check available methods
    console.log('\n2. Available client methods:');
    console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(name => name !== 'constructor'));
    
    // Test 3: Simple upload test
    console.log('\n3. Testing simple upload...');
    const testData = Buffer.from('test file content');
    const testKey = `test-upload-${Date.now()}.txt`;
    
    try {
      const uploadResult = await client.uploadFromBytes(testKey, testData);
      console.log('Upload result:', uploadResult);
      console.log('Upload result type:', typeof uploadResult);
      console.log('Upload result keys:', uploadResult ? Object.keys(uploadResult) : 'null/undefined');
      
      // Test 4: List files to see if upload worked
      console.log('\n4. Testing list operation...');
      const listResult = await client.list();
      console.log('List result:', listResult);
      console.log('List result type:', typeof listResult);
      
      // Test 5: Download the file we just uploaded
      console.log('\n5. Testing download...');
      const downloadResult = await client.downloadAsBytes(testKey);
      console.log('Download result:', downloadResult);
      console.log('Download content:', downloadResult ? downloadResult.toString() : 'null/undefined');
      
      // Test 6: Delete the test file
      console.log('\n6. Testing delete...');
      const deleteResult = await client.delete(testKey);
      console.log('Delete result:', deleteResult);
      
    } catch (operationError) {
      console.error('Operation failed:', operationError);
      console.error('Error details:', {
        message: operationError.message,
        code: operationError.code,
        stack: operationError.stack?.split('\n').slice(0, 3).join('\n')
      });
    }
    
  } catch (initError) {
    console.error('Client initialization failed:', initError);
  }
}

debugObjectStorage().catch(console.error);