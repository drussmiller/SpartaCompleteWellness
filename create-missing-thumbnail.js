
import { Client } from '@replit/object-storage';

async function createMissingThumbnail() {
  try {
    const client = new Client();
    
    // Source video file
    const videoKey = 'shared/uploads/1750097964520-IMG_7923.MOV';
    
    // Check if video exists
    console.log('Checking if video exists:', videoKey);
    const videoExists = await client.exists(videoKey);
    if (!videoExists.ok || !videoExists.value) {
      console.error('Video file does not exist in Object Storage');
      return;
    }
    
    console.log('Video file exists, checking for existing thumbnails...');
    
    // Check for existing thumbnail with different extensions
    const possibleThumbnails = [
      'shared/uploads/1750097964520-IMG_7923.jpeg',
      'shared/uploads/1750097964520-IMG_7923.jpg',
      'shared/uploads/1750097964520-IMG_7923.poster.jpg'
    ];
    
    for (const thumbKey of possibleThumbnails) {
      const exists = await client.exists(thumbKey);
      if (exists.ok && exists.value) {
        console.log('Found existing thumbnail:', thumbKey);
        
        // If it's not the expected .jpeg, copy it to the expected location
        if (thumbKey !== 'shared/uploads/1750097964520-IMG_7923.jpeg') {
          console.log('Copying to expected location...');
          const downloadResult = await client.downloadAsBytes(thumbKey);
          if (downloadResult.ok) {
            const uploadResult = await client.uploadFromBytes('shared/uploads/1750097964520-IMG_7923.jpeg', downloadResult.value);
            if (uploadResult.ok) {
              console.log('Successfully created thumbnail at expected location');
              return;
            }
          }
        } else {
          console.log('Thumbnail already exists at expected location');
          return;
        }
      }
    }
    
    console.log('No existing thumbnails found. The thumbnail needs to be generated from the video file.');
    console.log('This requires video processing on the server side.');
    
  } catch (error) {
    console.error('Error creating thumbnail:', error);
  }
}

createMissingThumbnail();
