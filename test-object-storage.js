import { Client } from '@replit/object-storage';

async function testObjectStorage() {
  try {
    console.log('Testing Object Storage connection...');
    const client = new Client();
    
    // Test basic connection by listing files
    console.log('Attempting to list files...');
    const listResult = await client.list();
    console.log('List result:', JSON.stringify(listResult, null, 2));
    
    // Test downloading a specific file that should exist
    console.log('Testing file download...');
    const testKey = 'uploads/1750097964520-IMG_7923.jpg';
    const downloadResult = await client.downloadAsBytes(testKey);
    console.log('Download result type:', typeof downloadResult);
    console.log('Download result size:', downloadResult?.length || 'undefined');
    
  } catch (error) {
    console.error('Object Storage test failed:', error.message);
    console.error('Error details:', error);
  }
}

testObjectStorage();