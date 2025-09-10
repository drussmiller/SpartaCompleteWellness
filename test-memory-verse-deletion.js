// Special test script for memory verse file deletion
import { Client } from '@replit/object-storage';

const client = new Client();

// Memory verse file from browser's network inspector
// Change this to the specific memory verse file you're trying to delete
const memoryVerseFile = '1746561079222-c34116f8.mov';

// Generate all possible paths for this memory verse file
function generateMemoryVersePaths(filename) {
  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const ext = filename.substring(filename.lastIndexOf('.')) || '';
  
  return [
    // Original video files
    `shared/uploads/${filename}`,
    `shared/uploads/memory_verse/${filename}`,
    
    // Thumbnail files with thumb- prefix (.jpg for all video formats)
    `shared/uploads/thumbnails/thumb-${baseName}.jpg`,
    `shared/uploads/thumbnails/memory_verse/thumb-${baseName}.jpg`,
    
    // Thumbnail files without thumb- prefix
    `shared/uploads/thumbnails/${baseName}.jpg`,
    `shared/uploads/thumbnails/memory_verse/${baseName}.jpg`,
    
    // .poster.jpg versions used by video players
    `shared/uploads/${baseName}.poster.jpg`,
    `shared/uploads/memory_verse/${baseName}.poster.jpg`
  ];
}

async function testMemoryVerseDeletion() {
  console.log(`Testing memory verse deletion for: ${memoryVerseFile}`);
  
  const paths = generateMemoryVersePaths(memoryVerseFile);
  console.log('Checking these paths for existence:');
  console.log(paths);
  
  // First check which files exist
  const results = [];
  
  for (const path of paths) {
    try {
      console.log(`\nChecking: ${path}`);
      const existsResult = await client.exists(path);
      
      // Extract actual boolean value from result
      let fileExists = false;
      if (typeof existsResult === 'object' && existsResult !== null) {
        if ('value' in existsResult) {
          fileExists = !!existsResult.value;
        } else {
          fileExists = !!existsResult;
        }
      }
      
      console.log(`Result: ${JSON.stringify(existsResult)}`);
      console.log(`File exists: ${fileExists}`);
      
      results.push({
        path,
        exists: fileExists,
        result: existsResult
      });
      
      // Try to delete if file exists
      if (fileExists) {
        console.log(`Attempting to delete: ${path}`);
        try {
          const deleteResult = await client.delete(path);
          console.log(`Deletion result: ${JSON.stringify(deleteResult)}`);
        } catch (deleteErr) {
          if (deleteErr.error && deleteErr.error.statusCode === 404) {
            console.log(`404 Not Found - file already gone or never existed`);
          } else {
            console.error(`Error deleting ${path}:`, deleteErr);
          }
        }
      }
    } catch (err) {
      console.error(`Error checking ${path}:`, err);
    }
  }
  
  // Summary
  console.log('\n=== SUMMARY ===');
  const existingFiles = results.filter(r => r.exists);
  console.log(`Found ${existingFiles.length} existing files out of ${paths.length} possible paths`);
  
  if (existingFiles.length > 0) {
    console.log('\nFiles that exist and need deletion:');
    existingFiles.forEach(f => console.log(`- ${f.path}`));
  } else {
    console.log('\nNo existing files found - all paths are already clear');
  }
}

// Run the test
testMemoryVerseDeletion()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err));