
import { Client } from '@replit/object-storage';

async function testCurrentObjectStorage() {
  console.log('=== Current Object Storage Diagnostics ===');
  console.log('Testing from working state...');
  
  // Check environment
  console.log('\nEnvironment check:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('REPLIT_ENVIRONMENT:', process.env.REPLIT_ENVIRONMENT);
  console.log('Has REPLIT_OBJECT_STORAGE_TOKEN:', !!process.env.REPLIT_OBJECT_STORAGE_TOKEN);
  
  try {
    // Test with bucket ID from .replit file
    console.log('\n--- Testing with bucket ID from .replit ---');
    const client = new Client({
      bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
    });
    
    // Test list operation (non-intrusive)
    console.log('Testing list operation...');
    const listResult = await client.list({ limit: 5 });
    console.log('List successful, found', listResult.length, 'files');
    console.log('Sample files:', listResult.slice(0, 3));
    
    // Test specific files that should exist
    const testKeys = [
      'shared/uploads/1746156624142-b3ece212.jpeg',
      'uploads/1746156624142-b3ece212.jpeg'
    ];
    
    for (const key of testKeys) {
      console.log(`\nTesting existence of: ${key}`);
      try {
        const exists = await client.exists(key);
        console.log(`  Exists: ${exists}`);
        
        if (exists) {
          const result = await client.downloadAsBytes(key);
          if (result && typeof result === 'object' && 'ok' in result) {
            console.log(`  Download test: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
          } else if (Buffer.isBuffer(result)) {
            console.log(`  Download test: SUCCESS (${result.length} bytes)`);
          } else {
            console.log(`  Download test: UNKNOWN_FORMAT`);
          }
        }
      } catch (error) {
        console.log(`  Error: ${error.message}`);
      }
    }
    
    // Test a simple upload to verify write permissions
    console.log('\n--- Testing upload permissions ---');
    const testKey = `test-auth-${Date.now()}.txt`;
    const testContent = 'Auth test content';
    
    try {
      await client.uploadFromText(testKey, testContent);
      console.log('Upload test: SUCCESS');
      
      // Clean up
      await client.delete(testKey);
      console.log('Cleanup: SUCCESS');
    } catch (uploadError) {
      console.log('Upload test: FAILED -', uploadError.message);
    }
    
  } catch (clientError) {
    console.error('Client initialization failed:', clientError.message);
    
    // Try fallback with default client
    console.log('\n--- Trying default client ---');
    try {
      const defaultClient = new Client();
      const listResult = await defaultClient.list({ limit: 3 });
      console.log('Default client works, found', listResult.length, 'files');
    } catch (defaultError) {
      console.log('Default client also failed:', defaultError.message);
    }
  }
}

testCurrentObjectStorage().catch(console.error);
