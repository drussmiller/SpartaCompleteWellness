/**
 * Utility to fix MOV thumbnails that are actually SVG files with .mov extension
 * This happens when thumbnail extraction fails and we generate SVG placeholders
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import * as ObjectStorage from '@replit/object-storage';

// Initialize Object Storage
const objectStorage = new ObjectStorage.Client({
  bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET || "default-bucket"
});

/**
 * Checks if a file is actually an SVG with a .mov extension
 * @param filePath Path to the file to check
 * @returns Promise<boolean> True if the file is an SVG with .mov extension
 */
async function isMovExtensionButSvgContent(filePath: string): Promise<boolean> {
  if (!filePath.toLowerCase().endsWith('.mov')) {
    return false;
  }
  
  try {
    // Check if file exists locally
    let fileContent: Buffer;
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath);
    } else {
      // Try object storage
      try {
        // Convert filePath to an Object Storage key
        const key = filePath.includes('/home/runner/workspace/')
          ? filePath.replace('/home/runner/workspace/', '')
          : filePath;
        
        try {
          const result = await objectStorage.downloadAsBytes(key);
          if (result.ok) {
            if (Buffer.isBuffer(result.value)) {
              fileContent = result.value;
            } else if (Array.isArray(result.value)) {
              // Handle array result (might be array of bytes/buffer)
              fileContent = Buffer.from(result.value[0] || '');
            } else if (typeof result.value === 'string') {
              fileContent = Buffer.from(result.value);
            } else {
              // Fall back to trying toString
              fileContent = Buffer.from(String(result.value || ''));
            }
          } else {
            logger.error(`File not found in Object Storage either: ${filePath}, error: ${result.error}`);
            return false;
          }
        } catch (err) {
          logger.error(`Error downloading file from Object Storage: ${err}`);
          return false;
        }
      } catch (err) {
        logger.error(`File not found in Object Storage either: ${filePath}`);
        return false;
      }
    }
    
    // Check if content starts with SVG signature
    const svgSignature = '<svg';
    const fileStart = fileContent.slice(0, 100).toString();
    return fileStart.includes(svgSignature);
  } catch (err) {
    logger.error(`Error checking file type: ${err}`);
    return false;
  }
}

/**
 * Rename a file with .mov extension to .svg if it contains SVG content
 * @param filePath Path to the file to fix
 * @returns Promise<string | null> Path to the new file or null if unchanged
 */
async function fixSvgWithMovExtension(filePath: string): Promise<string | null> {
  if (!await isMovExtensionButSvgContent(filePath)) {
    return null;
  }
  
  const newPath = filePath.replace(/\.mov$/i, '.svg');
  logger.info(`Converting misnamed SVG: ${filePath} -> ${newPath}`);
  
  try {
    // If local file exists, rename it
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, newPath);
    }
    
    // Always handle Object Storage version too
    try {
      // Create proper Object Storage keys
      const originalKey = filePath.includes('/home/runner/workspace/')
        ? filePath.replace('/home/runner/workspace/', '')
        : filePath;
      
      const newKey = originalKey.replace(/\.mov$/i, '.svg');
      
      // Download from original location
      const downloadResult = await objectStorage.downloadAsBytes(originalKey);
      if (!downloadResult.ok) {
        throw new Error(`Failed to download file: ${downloadResult.error}`);
      }
      // Ensure we're working with a Buffer
      let fileContent: Buffer;
      if (Buffer.isBuffer(downloadResult.value)) {
        fileContent = downloadResult.value;
      } else if (Array.isArray(downloadResult.value)) {
        // Handle array result (might be array of bytes/buffer)
        fileContent = Buffer.from(downloadResult.value[0] || '');
      } else if (typeof downloadResult.value === 'string') {
        fileContent = Buffer.from(downloadResult.value);
      } else {
        // Fall back to trying toString
        fileContent = Buffer.from(String(downloadResult.value || ''));
      }
      
      // Save to new location with the correct method
      try {
        // For Replit Object Storage
        await objectStorage.uploadFromBytes(newKey, fileContent);
        logger.info(`File uploaded to ${newKey}`);
      } catch (error) {
        throw new Error(`Failed to upload file: ${error}`);
      }
      
      // Delete the original
      const deleteResult = await objectStorage.delete(originalKey);
      if (!deleteResult.ok) {
        logger.warn(`Failed to delete original file: ${deleteResult.error}`);
      }
      
      logger.info(`Fixed in Object Storage: ${originalKey} -> ${newKey}`);
    } catch (err) {
      logger.error(`Object Storage operation failed: ${err}`);
    }
    
    return newPath;
  } catch (err) {
    logger.error(`Error fixing misnamed SVG: ${err}`);
    return null;
  }
}

/**
 * Find and fix all SVG files with .mov extension in a directory and its subdirectories
 * @param dirPath Directory to search
 * @returns Promise<{fixed: number, errors: number}> Stats on fixed files
 */
export async function fixAllMisnamedSvgs(dirPath: string): Promise<{fixed: number, errors: number}> {
  const stats = {
    checked: 0,
    fixed: 0,
    errors: 0,
    skipped: 0
  };
  
  logger.info(`Scanning directory for misnamed SVGs: ${dirPath}`);
  
  try {
    // First check if local directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Get list of files from local filesystem
    const processLocalFiles = async () => {
      try {
        const filesAndDirs = fs.readdirSync(dirPath);
        
        for (const item of filesAndDirs) {
          const fullPath = path.join(dirPath, item);
          
          // Check if it's a directory
          if (fs.statSync(fullPath).isDirectory()) {
            // Recursively process subdirectory
            const subStats = await fixAllMisnamedSvgs(fullPath);
            stats.fixed += subStats.fixed;
            stats.errors += subStats.errors;
          } else if (item.toLowerCase().endsWith('.mov')) {
            // It's a MOV file, check if it's actually an SVG
            stats.checked++;
            
            try {
              const newPath = await fixSvgWithMovExtension(fullPath);
              if (newPath) {
                stats.fixed++;
              } else {
                stats.skipped++;
              }
            } catch (err) {
              logger.error(`Error processing file ${fullPath}: ${err}`);
              stats.errors++;
            }
          }
        }
      } catch (err) {
        logger.error(`Error reading directory ${dirPath}: ${err}`);
      }
    };
    
    // Get list of files from Object Storage
    const processObjectStorageFiles = async () => {
      try {
        // Create key for Object Storage (without workspace prefix)
        const storageKey = dirPath.includes('/home/runner/workspace/')
          ? dirPath.replace('/home/runner/workspace/', '')
          : dirPath;
        
        // List files from object storage
        const result = await objectStorage.list({
          prefix: storageKey
        });
        
        if (!result.ok) {
          logger.error(`Failed to list files: ${result.error}`);
          return;
        }
        
        // Process each item that ends with .mov
        for (const item of result.value) {
          // Ensure we're working with a string key
          const key = typeof item === 'string' ? item : (item as any).key || '';
          
          if (typeof key === 'string' && key.toLowerCase().endsWith('.mov') && 
              (key.includes('/thumbnails/') || key.includes('/thumb-'))) {
            
            // Convert back to a file path for consistency
            const filePath = path.join('/home/runner/workspace', key);
            stats.checked++;
            
            try {
              const newPath = await fixSvgWithMovExtension(filePath);
              if (newPath) {
                stats.fixed++;
              } else {
                stats.skipped++;
              }
            } catch (err) {
              logger.error(`Error processing Object Storage file ${key}: ${err}`);
              stats.errors++;
            }
          }
        }
      } catch (err) {
        logger.error(`Error listing Object Storage items for ${dirPath}: ${err}`);
      }
    };
    
    // Process both local and Object Storage files
    await processLocalFiles();
    await processObjectStorageFiles();
    
    logger.info(`SVG fix complete for ${dirPath}`);
    return { fixed: stats.fixed, errors: stats.errors };
  } catch (err) {
    logger.error(`Error in fixAllMisnamedSvgs: ${err}`);
    return { fixed: 0, errors: 1 };
  }
}

/**
 * Main function to fix both uploads folders
 */
export async function fixAllThumbnails(): Promise<{fixed: number, errors: number}> {
  const stats = {
    fixed: 0,
    errors: 0
  };

  // Fix all shared thumbnails
  logger.info('Starting thumbnail fix process...');
  
  try {
    // Process thumbnails in both regular and shared uploads folders
    const locations = [
      '/home/runner/workspace/uploads/thumbnails',
      '/home/runner/workspace/shared/uploads/thumbnails'
    ];
    
    for (const location of locations) {
      logger.info(`Processing location: ${location}`);
      const locationStats = await fixAllMisnamedSvgs(location);
      stats.fixed += locationStats.fixed;
      stats.errors += locationStats.errors;
    }
    
    logger.info('Thumbnail fix process complete');
    return stats;
  } catch (err) {
    logger.error(`Error in fixAllThumbnails: ${err}`);
    return { fixed: 0, errors: 1 };
  }
}