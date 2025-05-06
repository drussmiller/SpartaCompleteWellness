// Test script to verify our exists() fix
import { Client } from '@replit/object-storage';

async function testExists() {
  console.log('Testing fixed exists() method interpretation...');
  
  const client = new Client();
  const specificFiles = [
    'shared/uploads/1746539378349-55fe520e.mov',
    'shared/uploads/thumbnails/thumb-1746539378349-55fe520e.jpg'
  ];
  
  console.log('Testing with these files:');
  console.log(specificFiles);
  
  for (const path of specificFiles) {
    console.log(`\nChecking: ${path}`);
    
    // Get the raw exists result
    const existsResult = await client.exists(path);
    console.log(`Raw exists result:`, existsResult);
    
    // Extract the actual boolean value that indicates if file exists
    let fileActuallyExists = false;
    
    if (typeof existsResult === 'object' && existsResult !== null) {
      if ('value' in existsResult) {
        fileActuallyExists = !!existsResult.value;
      } else {
        fileActuallyExists = !!existsResult;
      }
    }
    
    console.log(`Interpreted result (does file exist): ${fileActuallyExists}`);
    
    // Let's show the proper interpretation
    console.log(`CORRECT METHOD: Check the 'value' property: ${existsResult.value}`);
    console.log(`INCORRECT METHOD: Check the entire object: ${!!existsResult}`);
    
    console.log(`RESULT: The file ${fileActuallyExists ? 'EXISTS' : 'DOES NOT EXIST'}`);
  }
}

testExists()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));