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
 * Direct route to serve files from the local filesystem
 * This is a fallback approach since the Object Storage API is having issues
 */
objectStorageRouter.get('/direct-download', (req: Request, res: Response) => {
  const { key } = req.query;
  
  if (!key || typeof key !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid "key" parameter'
    });
  }
  
  try {
    // Clean key (remove leading slash if present)
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    logger.info(`Direct file serving for key: ${cleanKey}`, { route: '/api/object-storage/direct-download' });
    
    // Define potential file paths in order of preference
    const basePath = '/home/runner/workspace';
    const uploadPath = `${basePath}/uploads`;
    
    // First try the standard path
    if (fs.existsSync(`${basePath}/${cleanKey}`)) {
      const filePath = `${basePath}/${cleanKey}`;
      const contentType = getContentType(filePath);
      res.setHeader('Content-Type', contentType);
      logger.info(`Found file at standard path: ${filePath}`);
      return res.sendFile(filePath);
    }
    
    // Try uploads directory paths
    if (!cleanKey.startsWith('uploads/') && cleanKey.includes('/')) {
      const filename = cleanKey.split('/').pop() || '';
      const uploadFilePath = `${uploadPath}/${filename}`;
      
      if (fs.existsSync(uploadFilePath)) {
        const contentType = getContentType(uploadFilePath);
        res.setHeader('Content-Type', contentType);
        logger.info(`Found file in uploads directory: ${uploadFilePath}`);
        return res.sendFile(uploadFilePath);
      }
    }
    
    // Check for thumbnails with/without thumb- prefix
    if (cleanKey.includes('thumbnails/')) {
      const filename = cleanKey.split('/').pop() || '';
      const thumbDir = `${uploadPath}/thumbnails`;
      
      // Check with thumb- prefix
      if (!filename.startsWith('thumb-')) {
        const prefixedPath = `${thumbDir}/thumb-${filename}`;
        if (fs.existsSync(prefixedPath)) {
          const contentType = getContentType(prefixedPath);
          res.setHeader('Content-Type', contentType);
          logger.info(`Found thumbnail with prefix: ${prefixedPath}`);
          return res.sendFile(prefixedPath);
        }
      } 
      // Check without thumb- prefix
      else {
        const unprefixedPath = `${thumbDir}/${filename.substring(6)}`;
        if (fs.existsSync(unprefixedPath)) {
          const contentType = getContentType(unprefixedPath);
          res.setHeader('Content-Type', contentType);
          logger.info(`Found thumbnail without prefix: ${unprefixedPath}`);
          return res.sendFile(unprefixedPath);
        }
      }
      
      // Check standard thumbnail path
      const standardThumbPath = `${thumbDir}/${filename}`;
      if (fs.existsSync(standardThumbPath)) {
        const contentType = getContentType(standardThumbPath);
        res.setHeader('Content-Type', contentType);
        logger.info(`Found thumbnail at standard path: ${standardThumbPath}`);
        return res.sendFile(standardThumbPath);
      }
    }
    
    // No longer serve default image - just return 404 as requested
    // This ensures no generic placeholders appear in the UI
    logger.info(`No default image fallback - returning 404 as configured`);
    
    
    // If we reach here, we couldn't find any matching file
    logger.error(`Failed to find file for key: ${cleanKey}`);
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