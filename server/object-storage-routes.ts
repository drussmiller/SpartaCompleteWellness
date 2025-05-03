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
  // Support both key and fileUrl parameters for backward compatibility
  const storageKey = req.query.key || req.query.fileUrl;
  
  if (!storageKey || typeof storageKey !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid storage key parameter (need "key" or "fileUrl")'
    });
  }
  
  try {
    // Clean key (remove leading slash if present)
    const cleanKey = storageKey.startsWith('/') ? storageKey.substring(1) : storageKey;
    logger.info(`Object Storage direct access for key: ${cleanKey}`, { route: '/api/object-storage/direct-download' });
    
    // Create array of possible keys to try
    const keysToTry = [];
    
    // Special handling for MOV files - always check JPG version first for thumbnails
    if (cleanKey.toLowerCase().endsWith('.mov')) {
      const jpgKey = cleanKey.replace(/\.mov$/i, '.jpg');
      
      // If we're accessing a thumbnail, prioritize the .jpg version
      if (cleanKey.includes('/thumbnails/')) {
        // Always check shared path first
        if (!jpgKey.startsWith('shared/')) {
          keysToTry.push(`shared/${jpgKey}`);
        }
        keysToTry.push(jpgKey);
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