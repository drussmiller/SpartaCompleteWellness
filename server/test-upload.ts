/**
 * Test script to upload a test file to Replit Object Storage
 * This script uploads a test file to both the regular and shared paths
 */
import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';

async function testObjectStorageUpload() {
  try {
    console.log("Starting Object Storage upload test...");
    
    // Create a new Object Storage client
    const objectStorage = new Client();
    
    // Use an existing image from attached_assets
    const sourceImagePath = path.join(process.cwd(), 'attached_assets', 'Sparta_Logo.jpg');
    
    // Check if the source file exists
    if (!fs.existsSync(sourceImagePath)) {
      console.error(`Source file not found: ${sourceImagePath}`);
      
      // List available files in the attached_assets directory
      console.log("Available files in attached_assets:");
      const files = fs.readdirSync(path.join(process.cwd(), 'attached_assets'));
      files.forEach(file => console.log(`- ${file}`));
      
      return;
    }
    
    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(sourceImagePath);
    console.log(`Read file: ${sourceImagePath}, size: ${fileBuffer.length} bytes`);
    
    // Define test keys for both regular and shared paths
    const testKey = 'uploads/test-image.jpg';
    const sharedTestKey = 'shared/uploads/test-image.jpg';
    
    // Upload to regular path
    console.log(`Uploading to ${testKey}...`);
    await objectStorage.uploadFromBytes(testKey, fileBuffer);
    console.log(`Successfully uploaded to ${testKey}`);
    
    // Upload to shared path
    console.log(`Uploading to ${sharedTestKey}...`);
    await objectStorage.uploadFromBytes(sharedTestKey, fileBuffer);
    console.log(`Successfully uploaded to ${sharedTestKey}`);
    
    // Verify both paths exist
    const regularExists = await objectStorage.exists(testKey);
    const sharedExists = await objectStorage.exists(sharedTestKey);
    
    console.log(`Regular path exists: ${regularExists}`);
    console.log(`Shared path exists: ${sharedExists}`);
    
    console.log("Object Storage upload test completed.");
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

// Run the test function
testObjectStorageUpload().catch(console.error);