/**
 * MOV Frame Extractor
 * 
 * This module provides specialized functions for extracting frames from MOV files,
 * which have proven to be challenging to handle properly in the application.
 */
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { logger } from './logger';

/**
 * Extract the first frame from a MOV file and save it as a JPG
 * 
 * @param sourcePath Path to the source MOV file
 * @param outputPath Path where the extracted frame should be saved as JPG
 * @param seekPosition Optional position (in seconds) to extract the frame from, defaults to 1.0
 * @returns Promise that resolves when frame is extracted or rejects with error
 */
export async function extractMovFrame(
  sourcePath: string, 
  outputPath: string,
  seekPosition: number = 1.0
): Promise<void> {
  // Generate a random process ID for logging
  const processId = Math.random().toString(36).substring(2, 8);
  logger.info(`Starting MOV frame extraction for ${path.basename(sourcePath)} at position ${seekPosition}s`, { processId });
  
  return new Promise<void>((resolve, reject) => {
    // Make sure the output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Configure ffmpeg with improved settings for better thumbnail quality
    const command = ffmpeg(sourcePath)
      .seekInput(seekPosition)  // Seek to a position past the initial black frame
      .inputOption('-ss 0.5')   // Additional seek to ensure we get a good frame
      .outputOptions([
        '-frames:v 1',     // Extract exactly one frame
        '-q:v 1',          // Highest quality (1-31, where 1 is best)
        '-vf scale=640:-1', // Scale to 640px width while maintaining aspect ratio
        '-f image2'        // Force image output format
      ])
      .on('start', (commandLine: string) => {
        logger.info(`FFmpeg MOV extraction command: ${commandLine}`, { processId });
      })
      .on('end', () => {
        logger.info(`Successfully extracted frame from MOV file to ${outputPath}`, { processId });
        
        // Verify the output file exists and has content
        try {
          const stats = fs.statSync(outputPath);
          
          if (stats.size > 0) {
            logger.info(`MOV frame extraction successful, size: ${stats.size} bytes`, { processId });
            resolve();
          } else {
            const error = new Error('Extracted frame file is empty');
            logger.error(`MOV frame extraction failed: empty output file`, { processId }, error);
            reject(error);
          }
        } catch (err) {
          logger.error(`Error verifying MOV frame output file: ${err}`, { processId });
          reject(err);
        }
      })
      .on('error', (err: Error, stdout: string, stderr: string) => {
        logger.error(`Error extracting MOV frame: ${err.message}`, { processId, stderr });
        reject(err);
      });
    
    // Execute ffmpeg to create the JPG frame
    command.save(outputPath);
  });
}

/**
 * Create all required thumbnail variants for a MOV file
 * 
 * @param sourceMovPath Path to the source MOV file
 * @param targetThumbPath Path where the main thumbnail should be saved
 * @returns Promise with paths to all generated thumbnails or error
 */
export async function createAllMovThumbnailVariants(
  sourceMovPath: string,
  targetThumbPath: string
): Promise<{ 
  jpgThumbPath: string,
  movThumbPath: string,
  posterPath: string,
  nonPrefixedThumbPath: string 
}> {
  const filename = path.basename(sourceMovPath);
  const dirname = path.dirname(targetThumbPath);
  
  // Define paths for all variants
  const jpgThumbPath = targetThumbPath.replace('.mov', '.jpg');
  const movThumbPath = targetThumbPath;
  
  // For poster path, ensure we use the .poster.jpg extension
  // This is critical for proper thumbnails display in the UI
  const fileBase = path.basename(filename, '.mov');
  const posterFilename = `${fileBase}.poster.jpg`;
  
  // Store the poster in the thumbnails directory  
  const posterPath = path.join(dirname, posterFilename);
  
  // Also create a poster in the uploads directory (non-thumbnails)
  // This is needed for the frontend to find the poster when using the original video path
  const uploadsDir = path.resolve(dirname, '..');  // Go up one directory from the thumbnails dir
  const uploadsSharedDir = path.join(dirname, '..', '..', 'shared', 'uploads');  // Path to shared/uploads 
  const uploadsMainPosterPath = path.join(uploadsDir, posterFilename);
  const uploadsSharedPosterPath = path.join(uploadsSharedDir, posterFilename);
  
  // For non-prefixed path (regular thumbnail)
  const nonPrefixedThumbPath = targetThumbPath.replace('thumb-', '');
  
  // Create result object for easier access
  const pathsResult = {
    jpgThumbPath,
    movThumbPath,
    posterPath,
    nonPrefixedThumbPath,
    uploadsMainPosterPath,   // Add new fields to the result object
    uploadsSharedPosterPath
  };
  
  try {
    // Check if source file exists and is readable
    if (!fs.existsSync(sourceMovPath)) {
      logger.error(`Source MOV file does not exist: ${sourceMovPath}`);
      await createFallbackSvgThumbnails(pathsResult);
      return pathsResult;
    }
    
    const sourceStats = fs.statSync(sourceMovPath);
    if (sourceStats.size === 0) {
      logger.error(`Source MOV file is empty: ${sourceMovPath}`);
      await createFallbackSvgThumbnails(pathsResult);
      return pathsResult;
    }
    
    // Define a series of frame positions to try (in seconds)
    // This gives us multiple chances to get a good non-black frame
    const framePositions = [1.0, 2.0, 0.5, 3.0, 0.1];
    let success = false;
    let lastError: any = null;
    
    // Try each position until we get a good frame
    for (const position of framePositions) {
      try {
        const tempJpgPath = `${jpgThumbPath}.temp`;
        
        // Extract the frame to a temporary path first
        await extractMovFrame(sourceMovPath, tempJpgPath, position);
        
        // Check if the extracted frame is valid by getting its size
        const stats = fs.statSync(tempJpgPath);
        
        // Only consider it valid if the size is reasonable (> 1KB)
        if (stats.size > 1024) {
          // Read the valid JPG data
          const jpgBuffer = fs.readFileSync(tempJpgPath);
          
          // Copy to all required local paths
          fs.writeFileSync(jpgThumbPath, jpgBuffer);
          fs.writeFileSync(movThumbPath, jpgBuffer);
          fs.writeFileSync(posterPath, jpgBuffer);
          fs.writeFileSync(nonPrefixedThumbPath, jpgBuffer);
          
          // Ensure the parent directories exist for the additional poster files
          const uploadsDir = path.dirname(uploadsMainPosterPath);
          const sharedDir = path.dirname(uploadsSharedPosterPath);
          
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          if (!fs.existsSync(sharedDir)) {
            fs.mkdirSync(sharedDir, { recursive: true });
          }
          
          // Write to the additional poster files locally
          fs.writeFileSync(uploadsMainPosterPath, jpgBuffer);
          fs.writeFileSync(uploadsSharedPosterPath, jpgBuffer);
          
          // IMPORTANT: Also upload thumbnails to Object Storage
          try {
            // Import spartaStorage to avoid circular dependencies
            const { spartaStorage } = await import('./sparta-object-storage');
            
            // Prepare thumbnail paths for object storage, following the same pattern the user expects
            const jpgThumbFilename = path.basename(jpgThumbPath);
            const movThumbFilename = path.basename(movThumbPath);
            const posterFilename = path.basename(posterPath);
            const nonPrefixedThumbFilename = path.basename(nonPrefixedThumbPath);
            const uploadsMainPosterFilename = path.basename(uploadsMainPosterPath);
            const uploadsSharedPosterFilename = path.basename(uploadsSharedPosterPath);
            
            // Store in object storage - these calls will create the appropriate shared URLs
            logger.info(`Uploading thumbnail images to Object Storage for ${filename}`);
            
            // Upload all variations for maximum compatibility
            await spartaStorage.storeBuffer(
              jpgBuffer, 
              jpgThumbFilename,
              'image/jpeg',
              true, // skipLocalStorage = true (only store in Object Storage)
              `shared/uploads/thumbnails/${jpgThumbFilename}`
            );
            
            await spartaStorage.storeBuffer(
              jpgBuffer, 
              posterFilename,
              'image/jpeg',
              true, 
              `shared/uploads/thumbnails/${posterFilename}`
            );
            
            await spartaStorage.storeBuffer(
              jpgBuffer, 
              uploadsMainPosterFilename,
              'image/jpeg',
              true, 
              `shared/uploads/${uploadsMainPosterFilename}`
            );
            
            await spartaStorage.storeBuffer(
              jpgBuffer, 
              uploadsSharedPosterFilename,
              'image/jpeg',
              true, 
              `shared/uploads/${uploadsSharedPosterFilename}`
            );
            
            logger.info(`Successfully uploaded all thumbnail variations to Object Storage for ${filename}`);
          } catch (objStorageError) {
            logger.error(`Failed to upload thumbnails to Object Storage: ${objStorageError}`, { 
              sourceFile: filename,
              error: objStorageError
            });
            // Continue with local files even if object storage upload fails
          }
          
          logger.info(`Created additional poster files at:
            - ${uploadsMainPosterPath}
            - ${uploadsSharedPosterPath}`);
          
          // Clean up temp file
          try { fs.unlinkSync(tempJpgPath); } catch(e) { /* ignore cleanup errors */ }
          
          logger.info(`Successfully created thumbnails from frame at position ${position}s for ${filename}`);
          success = true;
          break;
        } else {
          logger.warn(`Extracted frame at ${position}s is too small (${stats.size} bytes), likely a black frame. Trying another position.`);
          try { fs.unlinkSync(tempJpgPath); } catch(e) { /* ignore cleanup errors */ }
        }
      } catch (error) {
        lastError = error;
        logger.warn(`Failed to extract frame at position ${position}s, trying next position: ${error}`);
        continue;
      }
    }
    
    if (success) {
      logger.info(`Created all MOV thumbnail variants for ${filename}`);
      return pathsResult;
    } else {
      logger.error(`Failed to extract usable frame after trying multiple positions: ${lastError}`, { sourceFile: filename });
      // If all frame extraction attempts fail, create SVG fallbacks
      await createFallbackSvgThumbnails(pathsResult);
      return pathsResult;
    }
  } catch (error) {
    logger.error(`Failed to create MOV thumbnail variants: ${error}`, { sourceFile: filename });
    // In case of any other error, create SVG fallbacks as a last resort
    try {
      await createFallbackSvgThumbnails(pathsResult);
    } catch (svgError) {
      logger.error(`Even fallback SVG creation failed: ${svgError}`, { sourceFile: filename });
    }
    return pathsResult;
  }
}

/**
 * Create a fallback SVG thumbnail when frame extraction fails
 * 
 * @param targetPaths Object containing paths where SVG thumbnails should be saved
 * @returns Promise that resolves when all SVGs are created
 */
export async function createFallbackSvgThumbnails(targetPaths: {
  jpgThumbPath: string,
  movThumbPath: string,
  posterPath: string,
  nonPrefixedThumbPath: string,
  uploadsMainPosterPath?: string,
  uploadsSharedPosterPath?: string
}): Promise<void> {
  // Create a simpler video play icon SVG - removed text for cleaner look
  const videoSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
    '<rect width="600" height="400" fill="#3A57E8"/>' +
    '<circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/>' +
    '<circle cx="300" cy="200" r="120" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>' +
    '<polygon points="290,180 290,220 320,200" fill="#fff"/></svg>'
  );
  
  try {
    // Make sure the directories exist
    Object.values(targetPaths).forEach(p => {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // Fix paths to always use svg extension for proper content-type handling
    const fixPathExtension = (originalPath: string): string => {
      // Replace problematic extensions with svg
      const fixedPath = originalPath
        .replace(/\.mov$/i, '.svg') // Replace .mov with .svg
        .replace(/\.mp4$/i, '.svg') // Replace .mp4 with .svg
        .replace(/\.webm$/i, '.svg'); // Replace .webm with .svg
      
      return fixedPath;
    };
    
    // Ensure all paths have svg extension and create them
    const jpgPath = fixPathExtension(targetPaths.jpgThumbPath);
    const movPath = fixPathExtension(targetPaths.movThumbPath);
    const posterPath = fixPathExtension(targetPaths.posterPath);
    const nonPrefixedPath = fixPathExtension(targetPaths.nonPrefixedThumbPath);
    
    // Optional paths for the uploads directory
    const uploadsMainPosterPath = targetPaths.uploadsMainPosterPath ? 
      fixPathExtension(targetPaths.uploadsMainPosterPath) : null;
    const uploadsSharedPosterPath = targetPaths.uploadsSharedPosterPath ? 
      fixPathExtension(targetPaths.uploadsSharedPosterPath) : null;
    
    // Write SVG to all fixed paths locally
    fs.writeFileSync(jpgPath, videoSvg);
    fs.writeFileSync(movPath, videoSvg);
    fs.writeFileSync(posterPath, videoSvg);
    fs.writeFileSync(nonPrefixedPath, videoSvg);
    
    // Write to additional paths if provided
    if (uploadsMainPosterPath) {
      fs.writeFileSync(uploadsMainPosterPath, videoSvg);
      logger.info(`Created fallback SVG at ${uploadsMainPosterPath}`);
    }
    
    if (uploadsSharedPosterPath) {
      fs.writeFileSync(uploadsSharedPosterPath, videoSvg);
      logger.info(`Created fallback SVG at ${uploadsSharedPosterPath}`);
    }
    
    // IMPORTANT: Also upload SVGs to Object Storage
    try {
      // Import spartaStorage to avoid circular dependencies
      const { spartaStorage } = await import('./sparta-object-storage');
      
      // Upload all SVG files to Object Storage
      logger.info(`Uploading fallback SVG files to Object Storage`);
      
      // Function to extract the relative path for Object Storage
      const getStorageKey = (fullPath: string): string => {
        const parts = fullPath.split('uploads');
        if (parts.length > 1) {
          return `shared/uploads${parts[1]}`;
        }
        return `shared/uploads/${path.basename(fullPath)}`;
      };
      
      // Upload all variations
      await spartaStorage.storeBuffer(
        videoSvg, 
        path.basename(jpgPath),
        'image/svg+xml',
        true, // skipLocalStorage = true (only store in object storage)
        getStorageKey(jpgPath)
      );
      
      await spartaStorage.storeBuffer(
        videoSvg, 
        path.basename(movPath),
        'image/svg+xml',
        true,
        getStorageKey(movPath)
      );
      
      await spartaStorage.storeBuffer(
        videoSvg, 
        path.basename(posterPath),
        'image/svg+xml',
        true,
        getStorageKey(posterPath)
      );
      
      await spartaStorage.storeBuffer(
        videoSvg, 
        path.basename(nonPrefixedPath),
        'image/svg+xml',
        true,
        getStorageKey(nonPrefixedPath)
      );
      
      if (uploadsMainPosterPath) {
        await spartaStorage.storeBuffer(
          videoSvg, 
          path.basename(uploadsMainPosterPath),
          'image/svg+xml',
          true,
          getStorageKey(uploadsMainPosterPath)
        );
      }
      
      if (uploadsSharedPosterPath) {
        await spartaStorage.storeBuffer(
          videoSvg, 
          path.basename(uploadsSharedPosterPath),
          'image/svg+xml',
          true,
          getStorageKey(uploadsSharedPosterPath)
        );
      }
      
      logger.info(`Successfully uploaded all SVG fallbacks to Object Storage`);
    } catch (objStorageError) {
      logger.error(`Failed to upload SVG fallbacks to Object Storage: ${objStorageError}`);
      // Continue with local files even if object storage upload fails
    }
    
    logger.info('Created fallback SVG thumbnails for video', { 
      paths: {
        jpgPath,
        movPath,
        posterPath,
        nonPrefixedPath
      }
    });
  } catch (error) {
    logger.error(`Failed to create fallback SVG thumbnails: ${error}`);
    throw error;
  }
}