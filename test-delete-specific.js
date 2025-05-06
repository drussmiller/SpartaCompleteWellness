import { Client } from '@replit/object-storage';

// Initialize Object Storage
const objectStorage = new Client();

const testPaths = [
  'shared/uploads/1746529011506-83d84bc0.mov',
  'shared/uploads/thumbnails/thumb-1746529011506-83d84bc0.jpg'
];

// Test other possible variations
const generateVariations = (basePath) => {
  const parts = basePath.split('/');
  const filename = parts[parts.length - 1];
  const results = [];
  
  // Try variations with thumb- prefix
  if (!filename.startsWith('thumb-') && filename.includes('.')) {
    const dir = parts.slice(0, -1).join('/');
    const thumbName = `thumb-${filename}`;
    results.push(`${dir}/${thumbName}`);
  }
  
  // For MOV files, try jpg variations
  if (filename.endsWith('.mov')) {
    const baseNoExt = filename.substring(0, filename.lastIndexOf('.'));
    const dir = parts.slice(0, -1).join('/');
    
    results.push(`${dir}/${baseNoExt}.jpg`);
    results.push(`${dir}/${baseNoExt}.poster.jpg`);
    
    // Try thumbnails directory
    const thumbDir = parts.slice(0, -2).join('/') + '/thumbnails';
    results.push(`${thumbDir}/${filename}`);
    results.push(`${thumbDir}/${baseNoExt}.jpg`);
    results.push(`${thumbDir}/thumb-${filename}`);
    results.push(`${thumbDir}/thumb-${baseNoExt}.jpg`);
  }
  
  return results;
};

// Expand paths with variations
testPaths.forEach(path => {
  const variations = generateVariations(path);
  testPaths.push(...variations);
});

// Remove duplicates
const uniquePaths = [...new Set(testPaths)];

async function testDeleteFiles() {
  console.log('Testing deletion of the following paths:');
  uniquePaths.forEach(path => console.log(` - ${path}`));
  
  for (const path of uniquePaths) {
    try {
      console.log(`\nAttempting to delete: ${path}`);
      
      // First check if the file exists
      try {
        const exists = await objectStorage.exists(path);
        console.log(`File exists check: ${exists ? 'YES' : 'NO'}`);
      } catch (existsErr) {
        console.log(`Error checking existence: ${existsErr}`);
      }
      
      // Attempt direct deletion
      try {
        console.log('Attempting direct deletion...');
        const deleteResult = await objectStorage.delete(path);
        console.log('Deletion result:', deleteResult);
        
        // Check success based on two possible response formats
        const isSuccess = 
          (typeof deleteResult === 'object' && 
           'ok' in deleteResult && 
           deleteResult.ok === true) || 
          (typeof deleteResult === 'object' && 
           'response' in deleteResult && 
           deleteResult.response && 
           'status' in deleteResult.response && 
           deleteResult.response.status === 200);
        
        console.log(`Deletion success: ${isSuccess ? 'YES' : 'NO'}`);
      } catch (deleteErr) {
        console.log('Deletion error:', deleteErr);
        
        // Check if this is a 404 error
        const is404Error = 
          (deleteErr && 
           typeof deleteErr === 'object' && 
           ('status' in deleteErr && deleteErr.status === 404)) || 
          (deleteErr && 
           typeof deleteErr === 'object' && 
           'error' in deleteErr && 
           typeof deleteErr.error === 'object' && 
           deleteErr.error &&
           'statusCode' in deleteErr.error && 
           deleteErr.error.statusCode === 404);
        
        if (is404Error) {
          console.log('This was a 404 error (file not found)');
        }
      }
      
    } catch (err) {
      console.error(`General error for path ${path}:`, err);
    }
  }
}

// Run the test
console.log('Starting deletion tests...');
testDeleteFiles()
  .then(() => console.log('Tests completed'))
  .catch(err => console.error('Test failed:', err));