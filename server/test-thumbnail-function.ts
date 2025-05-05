/**
 * Test script for thumbnail generation and storage
 * This script tests the thumbnail generation and storage functions
 * to make sure they're working correctly.
 */

import path from 'path';
import fs from 'fs';
import { createAllMovThumbnailVariants } from './mov-frame-extractor';
import { spartaStorage } from './sparta-object-storage';
import { logger } from './logger';

// Enable console output for debugging
logger.setConsoleOutputEnabled(true);

async function testThumbnailGeneration() {
  try {
    console.log('Starting thumbnail generation test...');
    
    // Check if we have a test video file
    const uploadsDir = path.join(process.cwd(), 'uploads');
    
    // List files in the uploads directory
    console.log('Listing files in uploads directory...');
    const files = fs.readdirSync(uploadsDir);
    
    // Find the first MOV file
    const movFile = files.find(file => file.toLowerCase().endsWith('.mov'));
    
    if (!movFile) {
      console.error('No MOV file found in uploads directory. Please upload a test MOV file first.');
      return;
    }
    
    console.log(`Found MOV file: ${movFile}`);
    
    // Generate source and target paths
    const sourceMovPath = path.join(uploadsDir, movFile);
    const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
    
    // Ensure thumbnails directory exists
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
    
    const targetThumbPath = path.join(thumbnailsDir, `thumb-${movFile}`);
    
    console.log(`Source MOV path: ${sourceMovPath}`);
    console.log(`Target thumb path: ${targetThumbPath}`);
    
    // Generate thumbnails
    console.log('Generating thumbnails...');
    const result = await createAllMovThumbnailVariants(sourceMovPath, targetThumbPath);
    
    console.log('Thumbnail generation result:', result);
    
    // Check if the files were created
    const filesToCheck = [
      result.jpgThumbPath,
      result.posterPath,
      result.nonPrefixedThumbPath
    ];
    
    // Also check the uploads directory poster files if they exist
    if (result.uploadsMainPosterPath) {
      filesToCheck.push(result.uploadsMainPosterPath);
    }
    
    if (result.uploadsSharedPosterPath) {
      filesToCheck.push(result.uploadsSharedPosterPath);
    }
    
    console.log('Checking if files were created...');
    for (const file of filesToCheck) {
      const exists = fs.existsSync(file);
      console.log(`File ${file}: ${exists ? 'EXISTS' : 'MISSING'}`);
      
      if (exists) {
        const stats = fs.statSync(file);
        console.log(`  - Size: ${stats.size} bytes`);
      }
    }
    
    // Check if the files exist in Object Storage
    console.log('Checking files in Object Storage...');
    
    // Get the storage key for the jpg thumbnail
    const getStorageKey = (filePath: string) => {
      if (!filePath) return null;
      const filename = path.basename(filePath);
      
      // For files in the thumbnails directory, prefix shared/uploads/thumbnails
      if (filePath.includes('/thumbnails/')) {
        return `shared/uploads/thumbnails/${filename}`;
      }
      
      // For files in the uploads directory, prefix shared/uploads
      return `shared/uploads/${filename}`;
    };
    
    for (const file of filesToCheck) {
      if (!file) continue;
      
      const storageKey = getStorageKey(file);
      if (!storageKey) {
        console.log(`Could not determine storage key for ${file}`);
        continue;
      }
      
      try {
        const fileInfo = await spartaStorage.getFileInfo(storageKey);
        console.log(`Object Storage file ${storageKey}: ${fileInfo ? 'EXISTS' : 'MISSING'}`);
        if (fileInfo) {
          console.log(`  - Size: ${fileInfo.size} bytes`);
        }
      } catch (error) {
        console.error(`Error checking Object Storage for ${storageKey}:`, error);
      }
    }
    
    console.log('Thumbnail generation test completed.');
  } catch (error) {
    console.error('Error during thumbnail generation test:', error);
  }
}

// Execute the test function
testThumbnailGeneration();