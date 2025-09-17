
const { Client } = require('@replit/object-storage');
const Database = require('better-sqlite3');

async function debugMissingMedia() {
  console.log('=== DEBUGGING MISSING MEDIA FILES ===\n');
  
  // Initialize Object Storage
  let objectStorage;
  try {
    objectStorage = new Client({
      bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
    });
    console.log('✓ Object Storage client initialized with bucket ID');
  } catch (error) {
    try {
      objectStorage = new Client();
      console.log('✓ Object Storage client initialized with default config');
    } catch (fallbackError) {
      console.error('✗ Object Storage not available:', fallbackError.message);
      return;
    }
  }

  // List all files in Object Storage
  console.log('\n--- Files in Object Storage ---');
  try {
    const allFiles = await objectStorage.list();
    console.log(`Found ${allFiles.length} files in Object Storage:`);
    allFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file}`);
    });
  } catch (error) {
    console.error('Error listing Object Storage files:', error.message);
    return;
  }

  // Check database for expected media files
  console.log('\n--- Media URLs in Database ---');
  try {
    const db = new Database('./server/sparta.db');
    
    // Get all posts with media
    const postsWithMedia = db.prepare(`
      SELECT id, title, mediaUrl, thumbnailUrl, created_at 
      FROM posts 
      WHERE mediaUrl IS NOT NULL 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();

    console.log(`Found ${postsWithMedia.length} recent posts with media:`);
    
    for (const post of postsWithMedia) {
      console.log(`\nPost ${post.id}: ${post.title || 'No title'}`);
      console.log(`  Created: ${post.created_at}`);
      console.log(`  Media URL: ${post.mediaUrl}`);
      console.log(`  Thumbnail URL: ${post.thumbnailUrl || 'None'}`);
      
      // Extract storage key from URL
      if (post.mediaUrl && post.mediaUrl.includes('storageKey=')) {
        const urlParams = new URLSearchParams(post.mediaUrl.split('?')[1]);
        const storageKey = urlParams.get('storageKey');
        if (storageKey) {
          console.log(`  Storage Key: ${storageKey}`);
          
          // Check if file exists in Object Storage
          try {
            const exists = await objectStorage.exists(storageKey);
            console.log(`  Exists in Storage: ${exists ? '✓' : '✗'}`);
            
            if (!exists) {
              console.log(`  ⚠️  MISSING FILE: ${storageKey}`);
            }
          } catch (error) {
            console.log(`  Error checking existence: ${error.message}`);
          }
        }
      }
    }
    
    db.close();
  } catch (error) {
    console.error('Error checking database:', error.message);
  }

  console.log('\n=== DEBUG COMPLETE ===');
}

debugMissingMedia().catch(console.error);
