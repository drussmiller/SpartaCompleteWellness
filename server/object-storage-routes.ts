/**
 * Object Storage Routes
 * 
 * This file contains direct routes for handling Object Storage operations
 * and serves as a centralized point for debugging Object Storage issues.
 */

import express, { Request, Response } from 'express';
import { Client } from '@replit/object-storage';
import { logger } from './logger';

export const objectStorageRouter = express.Router();

// Initialize Object Storage client
let objectStorage: Client | null = null;
try {
  // Try with bucket ID first
  objectStorage = new Client({
    bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
  });
  console.log('Object Storage routes initialized successfully with bucket ID');
} catch (error) {
  try {
    // Fallback to default initialization (no config)
    objectStorage = new Client();
    console.log('Object Storage routes initialized successfully with default config');
  } catch (fallbackError) {
    console.log('Object Storage not available for routes:', fallbackError);
    objectStorage = null;
  }
}

/**
 * Direct download route for Object Storage files
 * This route handles requests for files stored in Object Storage
 * - For any file ending in .mov, .mov.poster.jpg, or similar special formats,
 *   this route will check for thumbnail variants in different locations
 */
objectStorageRouter.get('/direct-download', async (req: Request, res: Response) => {
  const { storageKey } = req.query;

  if (!storageKey || typeof storageKey !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Storage key is required'
    });
  }

  if (!objectStorage) {
    return res.status(503).json({
      success: false,
      message: 'Object Storage not available'
    });
  }

  try {
    // Clean key (remove leading slash if present)
    const cleanKey = storageKey.startsWith('/') ? storageKey.substring(1) : storageKey;
    logger.info(`Object Storage direct access for key: ${cleanKey}`, { route: '/api/object-storage/direct-download' });

    // Only use the valid shared/uploads/ path pattern
    let finalKey = cleanKey;

    // If the key doesn't start with shared/uploads/, add the prefix
    if (!cleanKey.startsWith('shared/uploads/')) {
      const filename = cleanKey.split('/').pop() || cleanKey;
      finalKey = `shared/uploads/${filename}`;
    }

    console.log(`[Object Storage] Using key: ${finalKey}`);

    try {
      const result = await objectStorage.downloadAsBytes(finalKey);
      console.log(`[Object Storage] Download result for ${finalKey}:`, {
        type: typeof result,
        hasOk: result && typeof result === 'object' && 'ok' in result,
        ok: result && typeof result === 'object' && 'ok' in result ? result.ok : undefined
      });

      // Handle the Object Storage response format
      let fileBuffer: Buffer;

      if (Buffer.isBuffer(result)) {
        fileBuffer = result;
      } else if (result && typeof result === 'object') {
        // Handle the actual Replit Object Storage response format
        if ('ok' in result && result.ok === true) {
          if (result.value) {
            if (Buffer.isBuffer(result.value)) {
              fileBuffer = result.value;
            } else if (typeof result.value === 'string') {
              fileBuffer = Buffer.from(result.value, 'base64');
            } else if (Array.isArray(result.value)) {
              // Handle array of bytes
              fileBuffer = Buffer.from(result.value);
            } else {
              logger.error(`Unexpected value type from Object Storage for ${storageKey}:`, typeof result.value);
              return res.status(404).json({ error: 'File not found', message: `Invalid data format for ${storageKey}` });
            }
          } else {
            logger.error(`No value in Object Storage result for ${storageKey}`);
            return res.status(404).json({ error: 'File not found', message: `No data for ${storageKey}` });
          }
        } else {
          logger.error(`Object Storage download failed for ${storageKey}:`, result);
          return res.status(404).json({ error: 'File not found', message: `Could not retrieve ${storageKey}` });
        }
      } else {
        logger.error(`Invalid response format from Object Storage for ${storageKey}:`, typeof result);
        return res.status(500).json({ error: 'Failed to serve file', message: 'Invalid response from storage' });
      }

      console.log(`[Object Storage] Successfully found file at key: ${finalKey}`);
      const filename = finalKey.split('/').pop() || '';
      res.setHeader('Content-Type', getContentType(filename));
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.send(fileBuffer);

    } catch (error) {
      console.log(`[Object Storage] Error accessing key ${finalKey}:`, error);
      return res.status(404).json({
        success: false,
        message: `File not found in Object Storage: ${finalKey}`
      });
    }

  } catch (error) {
    console.error('[Object Storage] Direct download error:', error);
    logger.error('Object Storage direct download failed', error, { route: '/api/object-storage/direct-download' });
    return res.status(500).json({
      success: false,
      message: 'Object Storage access failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Test route for Object Storage API capabilities
 * Runs a comprehensive test of Object Storage operations
 */
objectStorageRouter.get('/test', async (req: Request, res: Response) => {
  if (!objectStorage) {
    return res.status(503).json({
      success: false,
      message: 'Object Storage not available'
    });
  }

  try {
    // Test basic Object Storage functionality
    const testKey = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Object Storage test content');

    // Upload test file
    const uploadResult = await objectStorage.uploadFromBytes(testKey, testContent);
    logger.info('Object Storage test upload completed', { route: '/api/object-storage/test' });

    // Download test file
    const downloadResult = await objectStorage.downloadAsBytes(testKey);
    logger.info('Object Storage test download completed', { route: '/api/object-storage/test' });

    // Clean up test file
    try {
      await objectStorage.delete(testKey);
      logger.info('Object Storage test cleanup completed', { action: 'test-cleanup', key: testKey });
    } catch (cleanupError) {
      console.log('Test cleanup failed (non-critical):', cleanupError);
    }

    return res.json({
      success: true,
      message: 'Object Storage is working correctly',
      uploadResult,
      downloadResult
    });

  } catch (error) {
    console.error('Object Storage test failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Object Storage test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * List all files in Object Storage matching a path/prefix
 */
objectStorageRouter.get('/list', async (req: Request, res: Response) => {
  if (!objectStorage) {
    return res.status(503).json({
      success: false,
      message: 'Object Storage not available'
    });
  }

  try {
    const { prefix = '' } = req.query;
    const files = await objectStorage.list({ prefix: prefix as string });

    return res.json({
      success: true,
      files,
      count: Array.isArray(files) ? files.length : 0
    });

  } catch (error) {
    console.error('Object Storage list failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list Object Storage files',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Helper function to guess content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'mov':
      return 'video/quicktime';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}