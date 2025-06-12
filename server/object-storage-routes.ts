/**
 * Object Storage Routes
 * 
 * This file contains direct routes for handling Object Storage operations
 * and serves as a centralized point for debugging Object Storage issues.
 */

import express, { Request, Response } from 'express';
import { logger } from './logger';

export const objectStorageRouter = express.Router();

/**
 * Direct download route for Object Storage files
 * Object Storage is currently disabled - using local storage only
 */
objectStorageRouter.get('/direct-download', async (req: Request, res: Response) => {
  // Object Storage temporarily disabled - return 404 immediately
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Test route for Object Storage API capabilities
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/test', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Fix route for SVG thumbnails that have .mov extension
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/fix-thumbnails', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Fix route specifically for poster.jpg files that may be in the wrong location
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/fix-poster-thumbnails', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * List all files in Object Storage matching a path/prefix
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/list', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Generate thumbnails for existing video files
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/generate-video-thumbnails', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Force generate a thumbnail for a specific MOV file
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/generate-thumbnail', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
});

/**
 * Check for specific thumbnail patterns to help debug thumbnail issues
 * Object Storage is currently disabled
 */
objectStorageRouter.get('/check-thumb-paths', async (req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
  });
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