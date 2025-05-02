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
    logger.info(`Object Storage direct access for key: ${cleanKey}`, { route: '/api/object-storage/direct-download' });
    
    // Get reference to SpartaObjectStorage
    const { spartaStorage } = await import('./sparta-object-storage');
    
    // Try to get file from Object Storage only - no filesystem fallback
    try {
      // Try to fetch from Object Storage
      const fileInfo = await spartaStorage.getFileInfo(`/${cleanKey}`);
      
      if (!fileInfo || !fileInfo.exists) {
        // If not found in Object Storage, return 404 without excessive logging
        // We're silently handling 404s to reduce console noise
        return res.status(404).json({
          success: false,
          message: 'File not found in Object Storage',
          key: cleanKey
        });
      }
      
      // If we have the file in Object Storage, stream it
      if (fileInfo.objectStorageUrl) {
        // Return the direct Object Storage URL if available
        logger.info(`Redirecting to Object Storage URL: ${fileInfo.objectStorageUrl}`);
        return res.redirect(fileInfo.objectStorageUrl);
      } else if (fileInfo.buffer) {
        // Or send the file buffer if we have it
        const contentType = getContentType(cleanKey);
        res.setHeader('Content-Type', contentType);
        logger.info(`Serving file from Object Storage buffer: ${cleanKey}`);
        return res.send(fileInfo.buffer);
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