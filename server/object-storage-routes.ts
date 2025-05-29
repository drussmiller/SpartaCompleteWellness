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

// Initialize Object Storage Client
const objectStorage = new ObjectStorage.Client({
  bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET || "default-bucket"
});

/**
 * Direct route to serve files exclusively from Object Storage
 * This route no longer falls back to the local filesystem as requested by user
 * 
 * Key enhancement for thumbnail handling: 
 * - For any file ending in .mov, .mov.poster.jpg, or similar special formats,
 *   this route will check for thumbnail variants in different locations
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
    const keysToTry: string[] = [];
    
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
            
            // Skip filesystem cache - serve directly from Object Storage
            // Try to download directly from Object Storage using the verified key
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
    
    // Extract a frame using ffmpeg
    try {
      // First try directly with ffmpeg for a high-quality frame
      // Make sure the directory exists first
      const uploadsLocation = path.dirname(posterJpgPathInUploads);
      if (!fs.existsSync(uploadsLocation)) {
        fs.mkdirSync(uploadsLocation, { recursive: true });
      }
      
      await extractMovFrame(sourcePath, posterJpgPathInUploads);
      
      // Copy extracted frame to all variations
      const fileContent = fs.readFileSync(posterJpgPathInUploads);
      fs.writeFileSync(posterJpgPathInThumbnails, fileContent);
      fs.writeFileSync(regularJpgPath, fileContent);
      
      // Upload to object storage if available
      if (objectStorage) {
        const sharedPosterJpgKey = `shared/uploads/${targetBaseName}.poster.jpg`;
        const sharedThumbnailPosterJpgKey = `shared/uploads/thumbnails/${targetBaseName}.poster.jpg`;
        const sharedThumbnailJpgKey = `shared/uploads/thumbnails/${targetBaseName}.jpg`;
        
        await objectStorage.uploadFromBytes(sharedPosterJpgKey, fileContent);
        await objectStorage.uploadFromBytes(sharedThumbnailPosterJpgKey, fileContent);
        await objectStorage.uploadFromBytes(sharedThumbnailJpgKey, fileContent);
      }
      
      // Return success with all created paths
      return res.status(200).json({
        success: true,
        fileUrl,
        thumbnails: {
          posterJpgInUploads: posterJpgPathInUploads,
          posterJpgInThumbnails: posterJpgPathInThumbnails,
          regularJpg: regularJpgPath
        }
      });
    } catch (error: any) {
      // If ffmpeg fails, try to generate a fallback SVG thumbnail
      logger.error(`Error extracting frame from MOV: ${error.message}`);
      
      // Create fallback SVG with timestamp to prevent caching
      const timestamp = Date.now();
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
        <rect width="640" height="480" fill="#333" />
        <text x="320" y="240" font-family="Arial" font-size="24" fill="#fff" text-anchor="middle">
          Video preview unavailable (${timestamp})
        </text>
      </svg>`;
      
      // Write SVG files to all variants
      // Make sure the directories exist
      const uploadsLocation = path.dirname(posterJpgPathInUploads);
      const thumbnailsLocation = path.dirname(posterJpgPathInThumbnails);
      
      if (!fs.existsSync(uploadsLocation)) {
        fs.mkdirSync(uploadsLocation, { recursive: true });
      }
      if (!fs.existsSync(thumbnailsLocation)) {
        fs.mkdirSync(thumbnailsLocation, { recursive: true });
      }
      
      fs.writeFileSync(posterJpgPathInUploads.replace('.jpg', '.svg'), svgContent);
      fs.writeFileSync(posterJpgPathInThumbnails.replace('.jpg', '.svg'), svgContent);
      fs.writeFileSync(regularJpgPath.replace('.jpg', '.svg'), svgContent);
      
      // Upload SVG to object storage
      if (objectStorage) {
        const sharedPosterSvgKey = `shared/uploads/${targetBaseName}.poster.svg`;
        const sharedThumbnailPosterSvgKey = `shared/uploads/thumbnails/${targetBaseName}.poster.svg`;
        const sharedThumbnailSvgKey = `shared/uploads/thumbnails/${targetBaseName}.svg`;
        
        await objectStorage.uploadFromBytes(sharedPosterSvgKey, Buffer.from(svgContent));
        await objectStorage.uploadFromBytes(sharedThumbnailPosterSvgKey, Buffer.from(svgContent));
        await objectStorage.uploadFromBytes(sharedThumbnailSvgKey, Buffer.from(svgContent));
      }
      
      return res.status(500).json({
        error: `Failed to extract frame with ffmpeg: ${error.message}`,
        fallback: 'Generated SVG fallbacks instead'
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