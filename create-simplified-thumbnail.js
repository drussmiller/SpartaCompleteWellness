const { Client } = require('@replit/object-storage');

async function createSimplifiedThumbnail() {
  try {
    // Initialize Object Storage client
    const client = new Client();
    
    // Source: existing thumbnail file
    const sourceKey = 'shared/uploads/1748530319608-d00bd114-0efa-442e-a7cb-4bb9e8e14739-IMG-7923.jpg';
    
    // Destination: simplified naming (same name as video but with .jpg extension)
    const destinationKey = 'shared/uploads/1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.jpg';
    
    console.log(`Copying thumbnail from ${sourceKey} to ${destinationKey}`);
    
    // Download the source file
    const downloadResult = await client.downloadAsBytes(sourceKey);
    if (!downloadResult.ok) {
      console.error('Failed to download source thumbnail:', downloadResult.error);
      return;
    }
    
    console.log('Downloaded source thumbnail, uploading to new location...');
    
    // Upload to new location
    const uploadResult = await client.uploadFromBytes(destinationKey, downloadResult.value);
    if (!uploadResult.ok) {
      console.error('Failed to upload to new location:', uploadResult.error);
      return;
    }
    
    console.log('Successfully created simplified thumbnail!');
    console.log(`New thumbnail available at: /api/serve-file?filename=1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.jpg`);
    
  } catch (error) {
    console.error('Error creating simplified thumbnail:', error);
  }
}

createSimplifiedThumbnail();