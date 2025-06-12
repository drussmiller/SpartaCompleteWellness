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
    
    // Create array of possible keys to try - comprehensive approach
    const keysToTry = [];
    
    // Extract filename without path
    const baseFilename = cleanKey.split('/').pop() || cleanKey;
    
    // Try the exact key as provided first
    keysToTry.push(cleanKey);
    
    // For the specific path structure shown in Object Storage: shared/uploads/thumbnails/
    if (cleanKey.includes('/thumbnails/') || cleanKey.includes('.poster.jpg')) {
      // This is the exact path structure from the screenshot
      keysToTry.push(cleanKey);
      if (!cleanKey.startsWith('shared/')) {
        keysToTry.push(`shared/${cleanKey}`);
      }
    } else {
      // Try with shared prefix if not already present
      if (!cleanKey.startsWith('shared/')) {
        keysToTry.push(`shared/${cleanKey}`);
      }
    }
    
    // Try simple uploads path variations
    keysToTry.push(`uploads/${baseFilename}`);
    keysToTry.push(`shared/uploads/${baseFilename}`);
    
    // Try environment-specific uploads (without shared prefix)
    keysToTry.push(`uploads/${baseFilename}`);
    
    // For thumbnails or poster files
    if (baseFilename.includes('thumb-') || baseFilename.includes('poster') || cleanKey.includes('thumbnails')) {
      keysToTry.push(`thumbnails/${baseFilename}`);
      keysToTry.push(`shared/uploads/thumbnails/${baseFilename}`);
      keysToTry.push(`uploads/thumbnails/${baseFilename}`);
      // Add direct shared path for thumbnails
      keysToTry.push(`shared/thumbnails/${baseFilename}`);
      // Try environment-specific keys without shared prefix
      keysToTry.push(`uploads-1746231712874-2e3265f3/thumbnails/${baseFilename}`);
      keysToTry.push(`shared/uploads-1746231712874-2e3265f3/thumbnails/${baseFilename}`);
      
      // Also try without thumb- prefix if present
      if (baseFilename.startsWith('thumb-')) {
        const withoutThumbPrefix = baseFilename.replace('thumb-', '');
        keysToTry.push(`uploads/${withoutThumbPrefix}`);
        keysToTry.push(`shared/uploads/${withoutThumbPrefix}`);
      }
    }
    
    // For video files, try poster variations
    if (baseFilename.toLowerCase().endsWith('.mov')) {
      const baseName = baseFilename.substring(0, baseFilename.lastIndexOf('.'));
      ['jpg', 'png', 'svg'].forEach(ext => {
        const posterName = `${baseName}.poster.${ext}`;
        keysToTry.push(`uploads/${posterName}`);
        keysToTry.push(`shared/uploads/${posterName}`);
        keysToTry.push(`thumbnails/${posterName}`);
        keysToTry.push(`uploads/thumbnails/${posterName}`);
        keysToTry.push(`shared/uploads/thumbnails/${posterName}`);
      });
    }
    
    // Log keys we're going to try
    logger.info(`Will try the following keys: ${JSON.stringify(keysToTry)}`, { route: '/api/object-storage/direct-download' });
    
    // Try each key until we find one that works
    for (const keyToTry of keysToTry) {
      try {
        console.log(`[Object Storage] Attempting direct access for key: ${keyToTry}`);
        
        const result = await objectStorage.downloadAsBytes(keyToTry);
        console.log(`[Object Storage] Download result for ${keyToTry}:`, {
          type: typeof result,
          hasOk: result && typeof result === 'object' && 'ok' in result,
          ok: result && typeof result === 'object' && 'ok' in result ? result.ok : undefined
        });
        
        // Handle Object Storage API response format: {ok: true, value: Buffer} or {ok: false, error: ...}
        if (result && typeof result === 'object' && 'ok' in result) {
          if (result.ok === true && result.value && Buffer.isBuffer(result.value)) {
            console.log(`[Object Storage] Successfully found file at key: ${keyToTry}`);
            res.setHeader('Content-Type', getContentType(baseFilename));
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return res.send(result.value);
          } else if (result.ok === false) {
            console.log(`[Object Storage] File not found at key: ${keyToTry} - ${result.error || 'Unknown error'}`);
            // Continue to next key
            continue;
          }
        }
        
        // If result is a Buffer directly (older API format)
        if (Buffer.isBuffer(result)) {
          console.log(`[Object Storage] Successfully found file (Buffer format) at key: ${keyToTry}`);
          res.setHeader('Content-Type', getContentType(baseFilename));
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          return res.send(result);
        }
        
      } catch (keyError) {
        console.log(`[Object Storage] Error trying key ${keyToTry}:`, keyError);
        // Continue to next key
        continue;
      }
    }
    
    // If we get here, none of the keys worked
    console.log(`[Object Storage] File not found after trying all variations for: ${cleanKey}`);
    return res.status(404).json({
      success: false,
      message: `File not found in Object Storage: ${cleanKey}`,
      triedKeys: keysToTry
    });
    
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