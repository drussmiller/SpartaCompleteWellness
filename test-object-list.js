import { Client } from '@replit/object-storage';

// Initialize Object Storage
const objectStorage = new Client();

// The specific file ID we're interested in
const fileId = '1746529011506-83d84bc0';

// Search patterns to use
const searchPatterns = [
  'shared/uploads/*' + fileId + '*',
  'shared/thumbnails/*' + fileId + '*',
  'uploads/*' + fileId + '*',
  'thumbnails/*' + fileId + '*',
  'shared*',
  '*/uploads/*mov',
  '*/uploads/thumbnails/*jpg'
];

async function listFilesForPattern(pattern) {
  console.log(`\nSearching for pattern: ${pattern}`);
  try {
    const files = await objectStorage.list({ prefix: pattern });
    if (files && files.length > 0) {
      console.log(`Found ${files.length} files matching pattern:`);
      files.forEach((file, i) => {
        console.log(`  ${i+1}. ${file}`);
      });
    } else {
      console.log('No files found matching this pattern');
    }
  } catch (err) {
    console.error(`Error searching for pattern ${pattern}:`, err);
  }
}

async function findFile(fileId) {
  console.log(`Searching for any files containing ID: ${fileId}`);

  for (const pattern of searchPatterns) {
    await listFilesForPattern(pattern);
  }
  
  // Additionally, list first 50 files from root
  console.log('\nListing first 50 files in root:');
  try {
    const rootFiles = await objectStorage.list({ limit: 50 });
    if (rootFiles && rootFiles.length > 0) {
      console.log(`Found ${rootFiles.length} files:`);
      rootFiles.forEach((file, i) => {
        console.log(`  ${i+1}. ${file}`);
      });
    } else {
      console.log('No files found in root');
    }
  } catch (err) {
    console.error('Error listing root files:', err);
  }
}

// Run the test
console.log('Starting file search...');
findFile(fileId)
  .then(() => console.log('Search completed'))
  .catch(err => console.error('Search failed:', err));