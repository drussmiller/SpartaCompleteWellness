/**
 * Script to regenerate a specific thumbnail with correct dimensions
 */
const fs = require('fs');
const path = require('path');

async function regenerateThumbnail() {
  try {
    const { spartaStorage } = await import('./server/sparta-object-storage.js');
    const { createMovThumbnail } = await import('./server/mov-frame-extractor-new.js');
    
    // Download the video from Object Storage first
    const videoKey = 'shared/uploads/1d8y5ha2mfb.MOV';
    const tempVideoPath = './temp-video.MOV';
    
    console.log('Downloading video from Object Storage...');
    const videoBuffer = await spartaStorage.objectStorage.download(videoKey);
    fs.writeFileSync(tempVideoPath, videoBuffer);
    
    console.log('Generating new thumbnail with correct dimensions...');
    const thumbnailFilename = await createMovThumbnail(tempVideoPath);
    
    if (thumbnailFilename) {
      console.log('✅ Successfully regenerated thumbnail:', thumbnailFilename);
    } else {
      console.log('❌ Failed to regenerate thumbnail');
    }
    
    // Clean up temp file
    try { fs.unlinkSync(tempVideoPath); } catch(e) { /* ignore */ }
    
  } catch (error) {
    console.error('Error regenerating thumbnail:', error);
  }
}

regenerateThumbnail();