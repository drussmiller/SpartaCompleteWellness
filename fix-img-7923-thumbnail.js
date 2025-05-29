import { Client } from '@replit/object-storage';

async function fixThumbnail() {
  const client = new Client();
  
  try {
    console.log('Fixing IMG-7923 thumbnail...');
    
    // Copy the poster.jpg (which has the correct image) to the simplified name
    const sourcePath = 'shared/uploads/1748537265313-1f372739-c485-4896-869b-f7d0821293ac-IMG-7923.MOV.poster.jpg';
    const targetPath = 'shared/uploads/IMG-7923.jpg';
    const thumbsPath = 'shared/uploads/thumbnails/IMG-7923.jpg';
    
    // Download the correct thumbnail
    const result = await client.download(sourcePath);
    if (!result.ok) {
      throw new Error(`Failed to download source: ${result.error}`);
    }
    
    const thumbnailData = result.value;
    console.log('Downloaded source thumbnail, size:', thumbnailData.length);
    
    // Upload to both locations
    const upload1 = await client.upload(targetPath, thumbnailData);
    const upload2 = await client.upload(thumbsPath, thumbnailData);
    
    if (upload1.ok && upload2.ok) {
      console.log('Successfully created simplified thumbnails:');
      console.log('- ', targetPath);
      console.log('- ', thumbsPath);
      
      // Clean up extra thumbnails
      const extraThumbs = [
        'shared/uploads/1748537265634-16b57c9a-c378-484a-b60e-bd89babb0cf0-thumb-IMG-7923.MOV',
        'shared/uploads/1748537265956-afc1e236-e5c4-4f61-8b48-bceac72c80cc-IMG-7923.jpg'
      ];
      
      for (const extraThumb of extraThumbs) {
        try {
          await client.delete(extraThumb);
          console.log('Deleted extra thumbnail:', extraThumb);
        } catch (err) {
          console.log('Could not delete', extraThumb, ':', err.message);
        }
      }
      
    } else {
      console.error('Upload failed:', upload1.error, upload2.error);
    }
    
  } catch (error) {
    console.error('Error fixing thumbnail:', error.message);
  }
}

fixThumbnail();