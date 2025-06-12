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
import { extractMovFrame } from './mov-frame-extractor';

export const objectStorageRouter = express.Router();

// Import Object Storage client directly
import { Client as ObjectStorageClient } from '@replit/object-storage';

// Object Storage temporarily disabled for stability
// const objectStorage = new ObjectStorageClient();

/**
 * Direct route to serve files exclusively from Object Storage
 * This route no longer falls back to the local filesystem as requested by user
 * 
 * Key enhancement for thumbnail handling: 
 * - For any file ending in .mov, .mov.poster.jpg, or similar special formats,
 *   this route will check for thumbnail variants in different locations
 */
objectStorageRouter.get('/direct-download', async (req: Request, res: Response) => {
  // Object Storage temporarily disabled - return 404 immediately
  return res.status(404).json({
    success: false,
    message: 'Object Storage temporarily disabled - using local storage'
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
    
    try {
      // Simplify to try only the exact key first since we know files exist
      console.log(`[Object Storage] Attempting direct access for exact key: ${cleanKey}`);
      
      try {
        const result = await objectStorage.downloadAsBytes(cleanKey);
        console.log(`[Object Storage] Download result for ${cleanKey}:`, {
          type: typeof result,
          hasOk: result && typeof result === 'object' && 'ok' in result,
          ok: result && typeof result === 'object' && 'ok' in result ? result.ok : undefined
        });
        
        // Handle Object Storage API response format: {ok: true, value: Buffer} or {ok: false, error: ...}
        if (result && typeof result === 'object' && 'ok' in result) {
          if (result.ok === true && result.value && Buffer.isBuffer(result.value)) {
            const contentType = getContentType(cleanKey);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            console.log(`[Object Storage] Successfully serving file: ${cleanKey}, size: ${result.value.length} bytes`);
            return res.send(result.value);
          } else {
            console.log(`[Object Storage] File not found or invalid response for ${cleanKey}:`, result);
          }
        } else {
          console.log(`[Object Storage] Unexpected response format for ${cleanKey}:`, typeof result);
        }
      } catch (err) {
        console.log(`[Object Storage] Direct key ${cleanKey} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      
      // If direct key failed, try alternative keys
      for (const tryKey of keysToTry.slice(1)) {
        try {
          console.log(`[Object Storage] Attempting fallback key: ${tryKey}`);
          const data = await objectStorage.downloadAsBytes(tryKey);
          
          let buffer: Buffer | null = null;
          
          if (Buffer.isBuffer(data)) {
            buffer = data;
          } else if (data && typeof data === 'object' && 'ok' in data) {
            if (data.ok && data.value && Buffer.isBuffer(data.value)) {
              buffer = data.value;
            }
          }
          
          if (buffer && buffer.length > 0) {
            const contentType = getContentType(tryKey);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            console.log(`[Object Storage] Successfully serving file: ${tryKey}, size: ${buffer.length} bytes`);
            return res.send(buffer);
          }
        } catch (err) {
          console.log(`[Object Storage] Key ${tryKey} not found, error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      
      // No fallback to local filesystem - Object Storage only
      logger.info(`File not found in Object Storage with any of the attempted keys`, { route: '/api/object-storage/direct-download' });
    } catch (objError) {
      logger.error(`Object Storage error: ${objError}`, { route: '/api/object-storage/direct-download' });
    }
    
    // No fallback placeholder images - if file not found, return 404
    
    // For non-images, return 404
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
        
        // Find .poster.jpg files as well as normal .jpg that match MOV files
        for (const file of files) {
          // Handle both poster jpg files and regular jpg files that might be thumbnails
          const isMovThumbnail = (file.endsWith('.jpg') || file.endsWith('.jpeg')) && 
                                (file.includes('.poster.') || // Check for .poster.jpg format
                                 (file.match(/^\d+-[a-z0-9]+\.jpg$/) && !file.includes('thumb-'))); // Or timestamp-hash.jpg format
          
          if (isMovThumbnail) {
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
                  
                  // Also create a ".poster.jpg" version if this is a regular jpg
                  if (!file.includes('.poster.')) {
                    const baseName = file.substring(0, file.lastIndexOf('.'));
                    const posterName = `${baseName}.poster.jpg`;
                    const posterPath = path.join(targetDir, posterName);
                    
                    // Copy to poster filename in local filesystem
                    fs.writeFileSync(posterPath, fileContent);
                    
                    // Also upload to object storage with poster name
                    const posterKey = `shared/uploads/thumbnails/${posterName}`;
                    await objectStorage.uploadFromBytes(posterKey, fileContent);
                    logger.info(`Created and uploaded poster duplicate at ${posterKey}`, { action: 'fix-poster-thumbnails' });
                  }
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
 * Generate thumbnails for existing video files
 * This route helps repair missing thumbnails for videos
 */
objectStorageRouter.get('/generate-video-thumbnails', async (req: Request, res: Response) => {
  try {
    // Path parameters - you can provide a specific post ID or generate for all
    const postId = req.query.postId as string;
    const specificVideoPath = req.query.path as string;
    
    logger.info(`Starting video thumbnail generation${postId ? ` for post ${postId}` : ' for all videos'}`, 
      { route: '/api/object-storage/generate-video-thumbnails' });
    
    if (specificVideoPath) {
      // Process a single specific video file
      const { spartaStorage } = await import('./sparta-object-storage');
      const { extractMovFrame } = await import('./mov-frame-extractor');
      
      const videoPath = specificVideoPath.startsWith('/') ? specificVideoPath.substring(1) : specificVideoPath;
      const baseDir = process.cwd();
      const fullVideoPath = path.join(baseDir, videoPath);
      
      // Create thumbnail path - put it in the thumbnails directory
      const parsedPath = path.parse(videoPath);
      const thumbnailFilename = `${parsedPath.name}.poster.jpg`;
      const thumbnailPath = path.join(baseDir, 'uploads', 'thumbnails', thumbnailFilename);
      const sharedThumbnailPath = path.join(baseDir, 'shared', 'uploads', 'thumbnails', thumbnailFilename);
      
      // Create directories if they don't exist
      if (!fs.existsSync(path.dirname(thumbnailPath))) {
        fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
      }
      if (!fs.existsSync(path.dirname(sharedThumbnailPath))) {
        fs.mkdirSync(path.dirname(sharedThumbnailPath), { recursive: true });
      }
      
      // Generate the thumbnail
      try {
        await extractMovFrame(fullVideoPath, thumbnailPath);
        logger.info(`Generated thumbnail for ${videoPath} at ${thumbnailPath}`, 
          { route: '/api/object-storage/generate-video-thumbnails' });
        
        // Copy to shared location for consistency
        fs.copyFileSync(thumbnailPath, sharedThumbnailPath);
        logger.info(`Copied thumbnail to shared location at ${sharedThumbnailPath}`, 
          { route: '/api/object-storage/generate-video-thumbnails' });
        
        // Upload to Object Storage
        if (objectStorage) {
          const thumbnailKey = `shared/uploads/thumbnails/${thumbnailFilename}`;
          const thumbnailData = fs.readFileSync(thumbnailPath);
          await objectStorage.upload(thumbnailKey, thumbnailData);
          logger.info(`Uploaded thumbnail to Object Storage at key: ${thumbnailKey}`, 
            { route: '/api/object-storage/generate-video-thumbnails' });
        }
        
        return res.json({
          success: true,
          message: 'Thumbnail generated successfully',
          paths: {
            original: thumbnailPath,
            shared: sharedThumbnailPath,
            objectStorage: `shared/uploads/thumbnails/${thumbnailFilename}`
          }
        });
      } catch (extractError) {
        logger.error(`Error extracting frame: ${extractError}`, 
          { route: '/api/object-storage/generate-video-thumbnails' });
        return res.status(500).json({
          success: false,
          message: 'Error generating thumbnail',
          error: extractError instanceof Error ? extractError.message : String(extractError)
        });
      }
    } else if (postId) {
      // Process videos for a specific post
      const { db } = await import('./db');
      const { posts } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Find the post
      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, parseInt(postId, 10)));
      
      if (!post || !post.image_url) {
        return res.status(404).json({
          success: false,
          message: 'Post not found or has no media'
        });
      }
      
      // Check if it's a video
      if (!post.image_url.toLowerCase().endsWith('.mov') && !post.is_video) {
        return res.status(400).json({
          success: false,
          message: 'Post does not contain a video'
        });
      }
      
      // Process the video (reuse existing code)
      const redirectUrl = `/api/object-storage/generate-video-thumbnails?path=${encodeURIComponent(post.image_url)}`;
      
      return res.redirect(redirectUrl);
    } else {
      // No specific path or post ID was provided
      // Find and process all memory verse videos (these are definitely videos)
      const { db } = await import('./db');
      const { posts } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      const memoryVersePosts = await db
        .select()
        .from(posts)
        .where(eq(posts.type, 'memory_verse'));
      
      const results = {
        total: memoryVersePosts.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [] as string[]
      };
      
      for (const post of memoryVersePosts) {
        if (!post.image_url) continue;
        
        results.processed++;
        
        try {
          // Make internal request to process each video
          const response = await fetch(
            `http://localhost:5000/api/object-storage/generate-video-thumbnails?path=${encodeURIComponent(post.image_url)}`
          );
          
          if (response.ok) {
            results.succeeded++;
          } else {
            results.failed++;
            const error = await response.text();
            results.errors.push(`Post ${post.id}: ${error}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`Post ${post.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      return res.json({
        success: true,
        message: 'Thumbnail generation process completed',
        results
      });
    }
  } catch (error) {
    logger.error(`Error in thumbnail generation: ${error}`, { route: '/api/object-storage/generate-video-thumbnails' });
    return res.status(500).json({
      success: false,
      message: 'Error running thumbnail generation',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Check for specific thumbnail patterns to help debug thumbnail issues
 */
/**
 * Force generate a thumbnail for a specific MOV file
 * This route is for direct thumbnail regeneration when thumbnails aren't displaying properly
 */
objectStorageRouter.get('/generate-thumbnail', async (req: Request, res: Response) => {
  try {
    console.log('Debug: Starting generate-thumbnail endpoint');
    console.log('Debug: Request query params:', req.query);
    console.log('Debug: cwd:', process.cwd());
    
    const { fileUrl } = req.query;
    
    if (!fileUrl || typeof fileUrl !== 'string') {
      return res.status(400).json({ error: 'fileUrl is required' });
    }
    
    // Define uploads and thumbnails directories - THESE ARE GLOBAL FOR THE ENTIRE FUNCTION
    const baseDir = process.cwd();
    // IMPORTANT: These variables are used elsewhere in the function, so their names must not be redefined in inner scopes
    const UploadsDir = path.join(baseDir, 'uploads');
    const ThumbnailsDir = path.join(baseDir, 'uploads', 'thumbnails');
    const SharedUploadsDir = path.join(baseDir, 'shared', 'uploads');
    const SharedThumbnailsDir = path.join(baseDir, 'shared', 'uploads', 'thumbnails');
    
    logger.info(`Generating thumbnail for: ${fileUrl}`, { route: '/api/object-storage/generate-thumbnail' });
    
    // Normalize the path - strip off any prefix paths
    const normalizedPath = fileUrl.includes('/uploads/') 
      ? fileUrl.substring(fileUrl.indexOf('/uploads/') + 9) 
      : fileUrl;
    
    // Only work with MOV files
    if (!normalizedPath.toLowerCase().endsWith('.mov')) {
      return res.status(400).json({ error: 'Only MOV files are supported for this operation' });
    }
    
    // Determine the base filename without extension
    const baseName = normalizedPath.substring(0, normalizedPath.lastIndexOf('.'));
    
    // Define source and target paths - prefer shared directory first
    console.log('Debug: SharedUploadsDir =', SharedUploadsDir);
    console.log('Debug: UploadsDir =', UploadsDir);
    console.log('Debug: normalizedPath =', normalizedPath);
    
    const sharedPath = path.join(SharedUploadsDir, normalizedPath);
    const regularPath = path.join(UploadsDir, normalizedPath);
    
    console.log('Debug: Checking if path exists:', sharedPath);
    const sharedExists = fs.existsSync(sharedPath);
    console.log('Debug: Shared path exists?', sharedExists);
    
    console.log('Debug: Checking if path exists:', regularPath);
    const regularExists = fs.existsSync(regularPath);
    console.log('Debug: Regular path exists?', regularExists);
    
    // Try both with and without case sensitivity
    let sourcePath = sharedExists 
      ? sharedPath 
      : (regularExists ? regularPath : null);
      
    if (!sourcePath) {
      // Try to find a case-insensitive match
      console.log('Debug: Trying case-insensitive search');
      try {
        const uploadsFiles = fs.readdirSync(UploadsDir);
        console.log('Debug: Files in UploadsDir:', uploadsFiles);
        
        const normalizedBasename = path.basename(normalizedPath).toLowerCase();
        const matchingFile = uploadsFiles.find(file => file.toLowerCase() === normalizedBasename);
        
        if (matchingFile) {
          console.log('Debug: Found case-insensitive match:', matchingFile);
          const matchPath = path.join(UploadsDir, matchingFile);
          if (fs.existsSync(matchPath)) {
            console.log('Debug: Using case-insensitive match path:', matchPath);
            sourcePath = matchPath;
          }
        }
      } catch (err) {
        console.error('Debug: Error in case-insensitive search:', err);
      }
    }
    
    const targetBaseName = baseName;
    
    // Create poster JPG thumbnails in multiple formats
    const posterJpgPathInUploads = path.join(SharedUploadsDir, `${targetBaseName}.poster.jpg`);
    const posterJpgPathInThumbnails = path.join(SharedThumbnailsDir, `${targetBaseName}.poster.jpg`);
    const regularJpgPath = path.join(SharedThumbnailsDir, `${targetBaseName}.jpg`);
    
    // Check if source file exists
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(404).json({ 
        error: `Source file not found at ${sourcePath}`,
        checkedPaths: {
          sharedPath,
          regularPath,
          sharedExists,
          regularExists
        }
      });
    }
    
    // Create thumbnails directories if they don't exist
    if (!fs.existsSync(SharedThumbnailsDir)) {
      fs.mkdirSync(SharedThumbnailsDir, { recursive: true });
    }
    
    // Use the clean thumbnail generation instead
    try {
      const { createMovThumbnail } = await import('./mov-frame-extractor-new');
      const thumbnailFilename = await createMovThumbnail(sourcePath);
      
      if (thumbnailFilename) {
        return res.status(200).json({
          success: true,
          fileUrl,
          thumbnails: {
            simplifiedJpg: thumbnailFilename
          }
        });
      } else {
        throw new Error('Failed to create thumbnail');
      }
    } catch (error: any) {
      logger.error(`Error creating thumbnail: ${error.message}`);
      return res.status(500).json({
        error: `Failed to create thumbnail: ${error.message}`
      });
    }
  } catch (error: any) {
    logger.error(`Error in generate-thumbnail: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

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