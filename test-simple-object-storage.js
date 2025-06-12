import { Client } from '@replit/object-storage';

async function testSimpleUpload() {
  console.log('=== Simple Object Storage Test ===');
  
  // Test environment variables
  console.log('Environment check:');
  console.log('REPLIT_ENVIRONMENT:', process.env.REPLIT_ENVIRONMENT);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('REPLIT_OBJECT_STORAGE_TOKEN exists:', !!process.env.REPLIT_OBJECT_STORAGE_TOKEN);
  
  try {
    // Test different initialization methods
    console.log('\n--- Testing initialization methods ---');
    
    // Method 1: With bucket ID
    let client1;
    try {
      client1 = new Client({
        bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
      });
      console.log('✓ Client with bucket ID created');
    } catch (e) {
      console.log('✗ Client with bucket ID failed:', e.message);
    }
    
    // Method 2: Default
    let client2;
    try {
      client2 = new Client();
      console.log('✓ Default client created');
    } catch (e) {
      console.log('✗ Default client failed:', e.message);
    }
    
    // Method 3: Empty config
    let client3;
    try {
      client3 = new Client({});
      console.log('✓ Empty config client created');
    } catch (e) {
      console.log('✗ Empty config client failed:', e.message);
    }
    
    // Test upload with the working client
    const testClient = client1 || client2 || client3;
    if (!testClient) {
      console.log('No working client found');
      return;
    }
    
    console.log('\n--- Testing upload ---');
    const testKey = `test-${Date.now()}.txt`;
    const testContent = 'Hello from Sparta!';
    
    try {
      const result = await testClient.uploadFromText(testKey, testContent);
      console.log('Upload result:', result);
      
      // Test download
      const downloaded = await testClient.downloadAsText(testKey);
      console.log('Downloaded content:', downloaded);
      
      // Cleanup
      await testClient.delete(testKey);
      console.log('✓ Test file cleaned up');
      
    } catch (uploadError) {
      console.log('Upload error details:');
      console.log('Message:', uploadError.message);
      console.log('Stack:', uploadError.stack);
      console.log('Full error:', uploadError);
    }
    
  } catch (error) {
    console.log('General error:', error);
  }
}

testSimpleUpload().catch(console.error);