import { Client } from '@replit/object-storage';

async function testClientInitialization() {
  try {
    console.log('Testing different client initialization methods...');
    console.log('REPL_ID:', process.env.REPL_ID);
    
    // Method 1: Default initialization (current approach)
    console.log('\n1. Testing default client initialization...');
    const defaultClient = new Client();
    
    // Method 2: Try with explicit bucket configuration
    console.log('\n2. Testing with bucket configuration...');
    const bucketClient = new Client({
      bucketId: process.env.REPL_ID || 'a0341f86-dcd3-4fbd-8a10-9a1965e07b56'
    });
    
    // Test both clients
    console.log('\n--- Testing default client ---');
    try {
      const defaultResult = await defaultClient.list();
      console.log('Default client result:', JSON.stringify(defaultResult, null, 2));
    } catch (error) {
      console.error('Default client error:', error.message);
    }
    
    console.log('\n--- Testing bucket client ---');
    try {
      const bucketResult = await bucketClient.list();
      console.log('Bucket client result:', JSON.stringify(bucketResult, null, 2));
    } catch (error) {
      console.error('Bucket client error:', error.message);
    }
    
  } catch (error) {
    console.error('Client initialization failed:', error.message);
    console.error('Full error:', error);
  }
}

testClientInitialization();