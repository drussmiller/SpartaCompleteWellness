import { Client } from '@replit/object-storage';
import sharp from 'sharp';

async function fixExistingThumbnails() {
  try {
    const client = new Client();
    
    // List of video files that need proper JPG thumbnails
    const videoFiles = [
      '1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.MOV',
      '1748530318062-e77d6502-072e-43fc-9ac7-9798f79bc353-IMG_7923.MOV',
      '1748535427039-68f80200-1aea-4b70-a3a7-061a2ef3d0a9-IMG-7923.MOV'
    ];
    
    for (const videoFile of videoFiles) {
      try {
        console.log(`Processing ${videoFile}...`);
        
        // Generate the thumbnail filename (same as video but with .jpg extension)
        const baseFilename = videoFile.replace(/\.[^/.]+$/, '');
        const thumbnailFilename = `${baseFilename}.jpg`;
        
        // Create a proper JPG thumbnail using Sharp
        const thumbnailBuffer = await sharp({
          create: {
            width: 320,
            height: 240,
            channels: 3,
            background: { r: 240, g: 240, b: 240 }
          }
        })
        .composite([
          {
            input: Buffer.from(`
              <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="25" fill="rgba(0,0,0,0.7)"/>
                <polygon points="20,18 20,42 42,30" fill="white"/>
              </svg>
            `),
            top: 90,
            left: 130
          }
        ])
        .jpeg({ quality: 80 })
        .toBuffer();
        
        // Upload the proper JPG thumbnail
        const thumbnailKey = `shared/uploads/${thumbnailFilename}`;
        const uploadResult = await client.uploadFromBytes(thumbnailKey, thumbnailBuffer);
        
        if (uploadResult.ok) {
          console.log(`✓ Created proper JPG thumbnail: ${thumbnailKey}`);
        } else {
          console.error(`✗ Failed to upload thumbnail for ${videoFile}:`, uploadResult.error);
        }
        
      } catch (error) {
        console.error(`Error processing ${videoFile}:`, error);
      }
    }
    
    console.log('Finished processing all video files');
    
  } catch (error) {
    console.error('Error fixing thumbnails:', error);
  }
}

fixExistingThumbnails();