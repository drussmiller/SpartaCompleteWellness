/**
 * Object Storage Routes
 * 
 * This file contains direct routes for handling Object Storage operations
 * and serves as a centralized point for debugging Object Storage issues.
 */

import express, { Request, Response } from 'express';
import * as ObjectStorage from '@replit/object-storage';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import { fixAllThumbnails } from './fix-mov-thumbnails';

export const objectStorageRouter = express.Router();

// Initialize Object Storage Client
const objectStorage = new ObjectStorage.Client({
  bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET || "default-bucket"
});

/**
 * Direct route to serve files exclusively from Object Storage
 * This route no longer falls back to the local filesystem as requested by user
 */
objectStorageRouter.get('/direct-download', async (req: Request, res: Response) => {
  // Extract the key parameter from query string - support all variations of parameter names
  const storageKey = req.query.key || req.query.fileUrl || req.query.path || req.query.file;
  
  // Log what parameter is actually being received for debugging
  console.log('Object storage request params:', {
    key: req.query.key,
    fileUrl: req.query.fileUrl,
    path: req.query.path,
    file: req.query.file
  });
  
  if (!storageKey || typeof storageKey !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid "key" parameter'
    });
  }
  
  try {
    // Clean key (remove leading slash if present)
    const cleanKey = storageKey.startsWith('/') ? storageKey.substring(1) : storageKey;
    logger.info(`Object Storage direct access for key: ${cleanKey}`, { route: '/api/object-storage/direct-download' });
    
    // Create array of possible keys to try
    const keysToTry = [];
    
    // Special handling for MOV files - check multiple formats
    if (cleanKey.toLowerCase().endsWith('.mov')) {
      // Try different extensions in preferred order
      const svgKey = cleanKey.replace(/\.mov$/i, '.svg');
      const jpgKey = cleanKey.replace(/\.mov$/i, '.jpg');
      const pngKey = cleanKey.replace(/\.mov$/i, '.png');
      
      // If we're accessing a thumbnail, prioritize images over video
      if (cleanKey.includes('/thumbnails/')) {
        // Always check shared path first - SVG highest priority as it's our fallback format
        if (!svgKey.startsWith('shared/')) {
          keysToTry.push(`shared/${svgKey}`);
        }
        keysToTry.push(svgKey);
        
        // Then try JPG
        if (!jpgKey.startsWith('shared/')) {
          keysToTry.push(`shared/${jpgKey}`);
        }
        keysToTry.push(jpgKey);
        
        // Then PNG
        if (!pngKey.startsWith('shared/')) {
          keysToTry.push(`shared/${pngKey}`);
        }
        keysToTry.push(pngKey);
      }
    }
    
    // Always check shared path first as that's our primary storage location
    if (!cleanKey.startsWith('shared/')) {
      keysToTry.push(`shared/${cleanKey}`);
    }
    
    // Then try the original key
    keysToTry.push(cleanKey);
    
    // For thumbnails, we may have keys with or without 'thumb-' prefix, so check both
    if (cleanKey.includes('/thumbnails/') && !cleanKey.includes('/thumbnails/thumb-')) {
      const pathParts = cleanKey.split('/thumbnails/');
      if (pathParts.length === 2) {
        const thumbKey = `${pathParts[0]}/thumbnails/thumb-${pathParts[1]}`;
        keysToTry.push(thumbKey);
        
        // Also try with shared prefix if needed
        if (!thumbKey.startsWith('shared/')) {
          keysToTry.push(`shared/${thumbKey}`);
        }
      }
    }
    
    // Log keys we're going to try
    logger.info(`Will try the following keys: ${JSON.stringify(keysToTry)}`, { route: '/api/object-storage/direct-download' });
    
    try {
      // Try to directly serve from Object Storage without using spartaStorage
      for (const tryKey of keysToTry) {
        try {
          logger.info(`Attempting direct Object Storage access for: ${tryKey}`, { route: '/api/object-storage/direct-download' });
          const data = await objectStorage.downloadAsBytes(tryKey);
          
          if (data && Buffer.isBuffer(data)) {
            const contentType = getContentType(tryKey);
            res.setHeader('Content-Type', contentType);
            logger.info(`Successfully serving file directly from Object Storage: ${tryKey}`, { route: '/api/object-storage/direct-download' });
            return res.send(data);
          }
        } catch (err) {
          // Just log and continue to the next key
          logger.info(`Key ${tryKey} not found in Object Storage, trying next option`, { route: '/api/object-storage/direct-download' });
        }
      }
      
      // If direct access failed, try using spartaStorage as fallback
      const { spartaStorage } = await import('./sparta-object-storage');
      
      // Try to get file with spartaStorage
      for (const tryKey of keysToTry) {
        try {
          const fileInfo = await spartaStorage.getFileInfo(`/${tryKey}`);
          
          if (fileInfo) {
            logger.info(`Found file with spartaStorage at key: ${tryKey}`, { route: '/api/object-storage/direct-download' });
            
            // Try to serve from filesystem cache if available
            if (fs.existsSync(fileInfo.path)) {
              const contentType = getContentType(tryKey);
              res.setHeader('Content-Type', contentType);
              logger.info(`Serving file from filesystem cache: ${fileInfo.path}`, { route: '/api/object-storage/direct-download' });
              return res.sendFile(fileInfo.path);
            } else {
              // Try one more direct access attempt with the key we know worked in spartaStorage
              try {
                const directKey = tryKey.startsWith('shared/') ? tryKey : `shared/${tryKey}`;
                logger.info(`Last attempt to fetch directly from Object Storage with key: ${directKey}`, { route: '/api/object-storage/direct-download' });
                const data = await objectStorage.downloadAsBytes(directKey);
                
                if (data && Buffer.isBuffer(data)) {
                  const contentType = getContentType(tryKey);
                  res.setHeader('Content-Type', contentType);
                  logger.info(`Last-chance success serving directly from Object Storage: ${directKey}`, { route: '/api/object-storage/direct-download' });
                  return res.send(data);
                }
              } catch (lastError) {
                logger.error(`Final direct access attempt failed: ${lastError}`, { route: '/api/object-storage/direct-download' });
              }
            }
          }
        } catch (objError) {
          logger.info(`Failed to get file info for key ${tryKey}: ${objError}`, { route: '/api/object-storage/direct-download' });
        }
      }
    } catch (objError) {
      logger.error(`Object Storage error: ${objError}`, { route: '/api/object-storage/direct-download' });
    }
    
    // If we reach here, we couldn't find the file in Object Storage
    // No longer check filesystem as requested by user
    // Silent 404 response - don't log to reduce noise for expected 404s
    return res.status(404).json({
      success: false,
      message: 'File not found',
      key: cleanKey
    });
    
  } catch (error) {
    logger.error(`Error in file serving: ${error}`, { route: '/api/object-storage/direct-download' });
    return res.status(500).json({
      success: false,
      message: 'Error retrieving file',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Test route for Object Storage API capabilities
 * Runs a comprehensive test of Object Storage operations
 */
objectStorageRouter.get('/test', async (req: Request, res: Response) => {
  try {
    logger.info('Running Object Storage API test', { route: '/api/object-storage/test' });
    
    // Import test function
    const { testObjectStorage } = await import('./test-storage-api');
    
    // Run the test
    const results = await testObjectStorage();
    
    // Return results
    return res.json({
      success: true,
      message: 'Object Storage API test completed',
      results
    });
  } catch (error) {
    logger.error(`Error running Object Storage test: ${error}`, { route: '/api/object-storage/test' });
    return res.status(500).json({
      success: false,
      message: 'Failed to run Object Storage API test',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Fix route for SVG thumbnails that have .mov extension
 * This will scan and fix all misnamed SVG files
 */
objectStorageRouter.get('/fix-thumbnails', async (req: Request, res: Response) => {
  try {
    logger.info('Starting thumbnail fix process', { route: '/api/object-storage/fix-thumbnails' });
    
    // Import the fix function dynamically to avoid circular dependencies
    const { fixAllThumbnails } = await import('./fix-mov-thumbnails');
    
    // Run the fix
    const results = await fixAllThumbnails();
    
    // Return results
    return res.json({
      success: true,
      message: 'Thumbnail fix process completed',
      results
    });
  } catch (error) {
    logger.error(`Error fixing thumbnails: ${error}`, { route: '/api/object-storage/fix-thumbnails' });
    return res.status(500).json({
      success: false,
      message: 'Failed to fix thumbnails',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Fix route specifically for poster.jpg files that may be in the wrong location
 * This scans uploads directory for .poster.jpg files and moves them to thumbnails directory
 */
objectStorageRouter.get('/fix-poster-thumbnails', async (req: Request, res: Response) => {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const thumbnailsDir = path.join(process.cwd(), 'uploads', 'thumbnails');
    const sharedUploadsDir = path.join(process.cwd(), 'shared', 'uploads');
    const sharedThumbnailsDir = path.join(process.cwd(), 'shared', 'uploads', 'thumbnails');
    
    logger.info('Starting poster thumbnail fix process', { route: '/api/object-storage/fix-poster-thumbnails' });
    
    // Make sure thumbnails directories exist
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
    if (!fs.existsSync(sharedThumbnailsDir)) {
      fs.mkdirSync(sharedThumbnailsDir, { recursive: true });
    }

    // Helper function to scan directory and fix files
    const fixDirectoryPosterThumbnails = async (dir: string, targetDir: string) => {
      const found: string[] = [];
      const moved: string[] = [];
      const errors: string[] = [];
      
      try {
        // Get all files in the directory
        const files = fs.readdirSync(dir);
        
        // Find .poster.jpg files
        for (const file of files) {
          if (file.includes('.poster.jpg')) {
            found.push(file);
            
            try {
              const sourcePath = path.join(dir, file);
              const targetPath = path.join(targetDir, file);
              
              // Read the source file
              const fileContent = fs.readFileSync(sourcePath);
              
              // Write to the thumbnails directory
              fs.writeFileSync(targetPath, fileContent);
              
              // Log success
              logger.info(`Moved ${file} to thumbnails directory`, { action: 'fix-poster-thumbnails' });
              moved.push(file);
              
              // Upload to object storage if available
              if (objectStorage) {
                try {
                  const sharedKey = `shared/uploads/thumbnails/${file}`;
                  await objectStorage.uploadFromBytes(sharedKey, fileContent);
                  logger.info(`Uploaded ${file} to Object Storage at ${sharedKey}`, { action: 'fix-poster-thumbnails' });
                } catch (uploadError) {
                  logger.error(`Failed to upload ${file} to Object Storage: ${uploadError}`, { action: 'fix-poster-thumbnails' });
                  errors.push(`Upload error for ${file}: ${uploadError}`);
                }
              }
            } catch (moveError) {
              logger.error(`Failed to move ${file}: ${moveError}`, { action: 'fix-poster-thumbnails' });
              errors.push(`Move error for ${file}: ${moveError}`);
            }
          }
        }
      } catch (dirError) {
        logger.error(`Error scanning directory ${dir}: ${dirError}`, { action: 'fix-poster-thumbnails' });
        errors.push(`Directory error for ${dir}: ${dirError}`);
      }
      
      return { found, moved, errors };
    };
    
    // Fix poster thumbnails in main and shared uploads directories
    const regularResult = await fixDirectoryPosterThumbnails(uploadsDir, thumbnailsDir);
    const sharedResult = await fixDirectoryPosterThumbnails(sharedUploadsDir, sharedThumbnailsDir);
    
    // Return results
    res.json({
      success: true,
      message: 'Poster thumbnail fix completed',
      regular: regularResult,
      shared: sharedResult
    });
  } catch (error) {
    logger.error(`Error fixing poster thumbnails: ${error}`, { action: 'fix-poster-thumbnails' });
    res.status(500).json({
      success: false,
      message: `Error fixing poster thumbnails: ${error}`
    });
  }
});

/**
 * List all files in Object Storage matching a path/prefix
 */
objectStorageRouter.get('/list', async (req: Request, res: Response) => {
  const { prefix } = req.query;
  
  if (!prefix || typeof prefix !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid "prefix" parameter'
    });
  }
  
  try {
    logger.info(`Listing files in Object Storage with prefix: ${prefix}`, { route: '/api/object-storage/list' });
    
    // Clean prefix (remove leading slash if present)
    const cleanPrefix = prefix.startsWith('/') ? prefix.substring(1) : prefix;
    
    // List all objects with this prefix
    const list = await objectStorage.list({ prefix: cleanPrefix });
    
    // Return the list
    return res.json({
      success: true,
      prefix: cleanPrefix,
      files: list
    });
  } catch (error) {
    logger.error(`Error listing files in Object Storage: ${error}`, { route: '/api/object-storage/list' });
    return res.status(500).json({
      success: false,
      message: 'Error listing files in Object Storage',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Check for specific thumbnail patterns to help debug thumbnail issues
 */
objectStorageRouter.get('/check-thumb-paths', async (req: Request, res: Response) => {
  try {
    // Get the file path or ID from query param
    const fileId = req.query.fileId || req.query.path || req.query.file;
    
    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Missing fileId parameter'
      });
    }
    
    const results: Record<string, boolean> = {};
    
    // Clean the ID - remove any path information if present
    const baseFilename = path.basename(fileId);
    
    // Test different path patterns for thumbnails
    const patterns = [
      `shared/uploads/thumbnails/${baseFilename}.jpg`,
      `shared/uploads/thumbnails/${baseFilename}.mov`,
      `shared/uploads/thumbnails/${baseFilename}.poster.jpg`,
      `shared/uploads/thumbnails/thumb-${baseFilename}.jpg`,
      `shared/uploads/thumbnails/thumb-${baseFilename}.mov`,
      `uploads/thumbnails/${baseFilename}.jpg`,
      `uploads/thumbnails/${baseFilename}.mov`,
      `uploads/thumbnails/${baseFilename}.poster.jpg`,
      `uploads/thumbnails/thumb-${baseFilename}.jpg`,
      `uploads/thumbnails/thumb-${baseFilename}.mov`,
    ];
    
    logger.info(`Checking thumbnail paths for file ID: ${baseFilename}`, { route: '/api/object-storage/check-thumb-paths' });
    
    // Check each pattern
    for (const pattern of patterns) {
      try {
        const exists = await objectStorage.exists(pattern);
        results[pattern] = exists;
        logger.info(`Object Storage exists check for ${pattern} returned ok:${exists}`);
      } catch (err) {
        results[pattern] = false;
        logger.error(`Error checking pattern ${pattern}: ${err}`);
      }
    }
    
    return res.json({
      success: true,
      message: "Thumbnail path check completed",
      fileId: baseFilename,
      results
    });
  } catch (error) {
    logger.error(`Error checking thumbnail paths: ${error}`, { route: '/api/object-storage/check-thumb-paths' });
    return res.status(500).json({
      success: false,
      message: 'Error checking thumbnail paths',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Helper function to guess content type based on file extension
 */
function getContentType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'avi':
      return 'video/x-msvideo';
    case 'pdf':
      return 'application/pdf';
    case 'json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}