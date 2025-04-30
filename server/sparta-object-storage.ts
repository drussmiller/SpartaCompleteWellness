import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import ffmpeg from 'fluent-ffmpeg';

/**
 * SpartaObjectStorage provides a unified interface for handling file objects
 * such as images and other media files with proper error handling and logging.
 */
export class SpartaObjectStorage {
  private baseDir: string;
  private thumbnailDir: string;
  private allowedTypes: string[];

  /**
   * Creates a new SpartaObjectStorage instance
   * @param baseDir Base directory to store original uploads
   * @param thumbnailDir Directory to store thumbnails
   * @param allowedTypes Array of allowed mime types
   */
  constructor(
    baseDir: string = path.resolve(process.cwd(), 'uploads'),
    thumbnailDir: string = path.resolve(process.cwd(), 'uploads', 'thumbnails'),
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'application/octet-stream'] // Added more video types and octet-stream
  ) {
    this.baseDir = baseDir;
    this.thumbnailDir = thumbnailDir;
    this.allowedTypes = allowedTypes;

    // Ensure we're using absolute paths to avoid any path resolution issues
    console.log("SpartaObjectStorage initialized with paths:", {
      baseDir: this.baseDir,
      thumbnailDir: this.thumbnailDir,
      cwd: process.cwd(),
      absoluteBaseDir: path.resolve(this.baseDir),
      absoluteThumbnailDir: path.resolve(this.thumbnailDir)
    });

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Make sure required directories exist
   */
  private ensureDirectories(): void {
    try {
      // Ensure absolute paths are used
      const baseDirPath = path.resolve(this.baseDir);
      const thumbnailDirPath = path.resolve(this.thumbnailDir);
      
      // Array of directories to ensure they exist
      const dirsToCreate = [
        // Base directories
        baseDirPath,
        thumbnailDirPath,
        
        // Special directories for memory verse videos
        path.join(baseDirPath, 'memory_verse'),
        path.join(thumbnailDirPath, 'memory_verse'),
        
        // Special directories for miscellaneous videos
        path.join(baseDirPath, 'miscellaneous'),
        path.join(thumbnailDirPath, 'miscellaneous'),
        
        // General video directory
        path.join(baseDirPath, 'videos')
      ];
      
      // Create each directory if it doesn't exist
      for (const dir of dirsToCreate) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          logger.info(`Created directory: ${dir}`);
        }
      }
    } catch (error) {
      logger.error('Error ensuring storage directories exist:', error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to create storage directories');
    }
  }

  /**
   * Stores a file from a Buffer or local path
   * @param fileData Buffer containing file data or path to local file
   * @param originalFilename Original filename from upload
   * @param mimeType MIME type of the file
   * @param isVideo Boolean indicating if the file is a video
   * @returns Promise with the stored file information
   */
  async storeFile(
    fileData: Buffer | string,
    originalFilename: string,
    mimeType: string,
    isVideo: boolean = false
  ): Promise<{ 
    url: string;
    thumbnailUrl: string | null;
    filename: string;
    mimeType: string;
    size: number;
    path: string;
  }> {
    try {
      console.log("SpartaObjectStorage.storeFile called", {
        originalFilename,
        mimeType,
        isVideo,
        isPath: typeof fileData === 'string',
        fileDataType: typeof fileData,
        fileDataLength: typeof fileData === 'string' ? fileData.length : fileData.length
      });
      
      // Validate file type with better handling for videos
      const fileExt = path.extname(originalFilename).toLowerCase();
      const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
      
      // Check if it's a video based on file extension or explicitly marked as video
      const isVideoByExtension = videoExtensions.includes(fileExt);
      
      // Force isVideo true if filename includes memory_verse or miscellaneous (helps with type detection)
      const isMemoryVerse = originalFilename.toLowerCase().includes('memory_verse');
      // For miscellaneous, only need either the filename to include 'miscellaneous' OR be a video extension
      const isMiscellaneousVideo = originalFilename.toLowerCase().includes('miscellaneous') || 
                                  (mimeType.startsWith('video/') && isVideoByExtension);
      
      // Always prioritize the passed isVideo flag if it's explicitly true
      if (isVideo) {
        console.log("Using explicit isVideo=true flag from caller");
      } else if (isMemoryVerse) {
        isVideo = true;
        console.log("Detected memory verse video by filename:", originalFilename);
      } else if (isMiscellaneousVideo && isVideoByExtension) {
        isVideo = true;
        console.log("Detected miscellaneous video by filename and/or extension:", originalFilename);
      } else if (mimeType.startsWith('video/') || isVideoByExtension) {
        // If file has video mime type or video extension, mark it as video
        isVideo = true;
        console.log("Detected video by MIME type or extension:", mimeType, fileExt);
      } else if (originalFilename.toLowerCase().includes('video-message')) {
        // Special case for video messages which might have incorrect mime types
        isVideo = true;
        console.log("Detected video-message by filename:", originalFilename);
      }
      
      // Either the mime type is in the allowed list OR it's a video file by extension/flag
      const isAllowed = this.allowedTypes.includes(mimeType) || 
                        (isVideo && (mimeType.startsWith('video/') || isVideoByExtension || isMemoryVerse));
      
      console.log("File validation check:", {
        mimeType,
        fileExt,
        isVideo,
        isVideoByExtension,
        isAllowed,
        allowedTypes: this.allowedTypes
      });
      
      if (!isAllowed) {
        logger.error(`File type not allowed:`, {
          mimeType,
          fileExt,
          isVideo,
          originalFilename
        });
        console.error(`File type ${mimeType} with extension ${fileExt} not allowed`);
        throw new Error(`File type ${mimeType} not allowed`);
      }

      // Generate a unique filename
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      // Use the already defined fileExt from above
      const safeFilename = `${timestamp}-${uniqueId}${fileExt}`;
      
      // Determine which directory to use based on original filename and video status
      let targetDir = this.baseDir;
      
      // Re-use the isMemoryVerse variable from above (line 123)
      // and handle miscellaneous videos similarly
      const isMemoryVideo = isMemoryVerse && isVideo;
      const isMiscVideo = originalFilename.toLowerCase().includes('miscellaneous') && isVideo;
      
      if (isMemoryVideo) {
        targetDir = path.join(this.baseDir, 'memory_verse');
        console.log("Using memory_verse directory for storage:", targetDir);
      } else if (isMiscVideo) {
        targetDir = path.join(this.baseDir, 'miscellaneous');
        console.log("Using miscellaneous directory for storage:", targetDir);
      }
      
      // Ensure the target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`Created directory for file: ${targetDir}`);
      }
      
      const filePath = path.join(targetDir, safeFilename);
      console.log("Generated safe filename and path", { 
        safeFilename, 
        filePath,
        baseDir: this.baseDir,
        targetDir
      });

      // Convert string path to buffer if needed
      let fileBuffer: Buffer;
      if (typeof fileData === 'string') {
        // If fileData is a path to a local file
        console.log("Reading file from path:", fileData);
        
        // Check if the file exists at the given path
        if (!fs.existsSync(fileData)) {
          console.error(`File not found at path: ${fileData}, checking alternative paths`);
          
          // Try to find the file with alternative paths
          const fileName = path.basename(fileData);
          
          // Find recent files in the uploads directory
          const uploadsDirPath = path.join(process.cwd(), 'uploads');
          let allFilesInUploads: string[] = [];
          try {
            allFilesInUploads = fs.readdirSync(uploadsDirPath)
              .filter(file => {
                const fileStat = fs.statSync(path.join(uploadsDirPath, file));
                // Look for files created in the last 30 seconds
                return fileStat.isFile() && 
                       (Date.now() - fileStat.birthtime.getTime() < 30 * 1000);
              })
              .map(file => path.join(uploadsDirPath, file));
              
            console.log("Recent files in uploads directory:", allFilesInUploads);
          } catch (err) {
            console.error("Error reading uploads directory:", err);
          }
          
          // Standard possible paths
          const possiblePaths = [
            fileData,
            path.join(process.cwd(), 'uploads', fileName),
            path.join(path.dirname(fileData), path.basename(fileData)),
            path.join(process.cwd(), fileName),
            path.join('/tmp', fileName),
            // Add recently uploaded files as potential source paths
            ...allFilesInUploads
          ];
          
          let foundPath = null;
          for (const altPath of possiblePaths) {
            console.log(`Checking alternative path: ${altPath}`);
            if (fs.existsSync(altPath)) {
              console.log(`Found file at alternative path: ${altPath}`);
              foundPath = altPath;
              break;
            }
          }
          
          if (foundPath) {
            fileData = foundPath;
          } else {
            throw new Error(`Could not find file at any alternative path for: ${fileData}`);
          }
        }
        
        try {
          const stats = fs.statSync(fileData);
          console.log("File stats:", { size: stats.size, isFile: stats.isFile() });
        } catch (statError) {
          console.error("Error getting file stats:", statError);
          throw statError; // Re-throw to halt processing
        }
        
        fileBuffer = fs.readFileSync(fileData);
        console.log("File read successfully, buffer size:", fileBuffer.length);
      } else {
        // If fileData is already a Buffer
        console.log("Using provided buffer directly, size:", fileData.length);
        fileBuffer = fileData;
      }

      // Write the file
      try {
        console.log(`Attempting to write file to ${filePath}, buffer size: ${fileBuffer.length}`);
        fs.writeFileSync(filePath, fileBuffer);
        console.log(`File written successfully to ${filePath}`);
        logger.info(`File written successfully to ${filePath}`);
      } catch (writeError) {
        console.error(`Error writing file to ${filePath}:`, writeError);
        logger.error(`Error writing file to ${filePath}:`, writeError);
        throw writeError;
      }

      // Get file size
      const stats = fs.statSync(filePath);
      logger.info(`File size: ${stats.size} bytes`);

      let thumbnailUrl = null;

      // Create thumbnail based on file type
      const thumbnailFilename = `thumb-${safeFilename}`;
      const thumbnailDirPath = path.resolve(this.thumbnailDir);
      const thumbnailPath = path.join(thumbnailDirPath, thumbnailFilename);
      
      console.log(`Preparing to create thumbnail: ${thumbnailFilename}`, {
        thumbnailPath,
        thumbnailDirPath,
        originalDir: this.thumbnailDir
      });

      try {
        // Ensure thumbnail directory exists
        if (!fs.existsSync(thumbnailDirPath)) {
          console.log(`Creating thumbnails directory: ${thumbnailDirPath}`);
          fs.mkdirSync(thumbnailDirPath, { recursive: true });
        }
        
        if (mimeType.startsWith('image/')) {
          // Process image thumbnail
          console.log(`Processing image thumbnail for ${safeFilename}`);
          await this.createThumbnail(filePath, thumbnailPath);
          thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
          console.log(`Image thumbnail created at ${thumbnailPath}`);
          logger.info(`Created image thumbnail for ${safeFilename}`);
        } else if (mimeType.startsWith('video/') || isVideo) {
          // Process video thumbnail
          console.log(`Processing video thumbnail for ${safeFilename}`, {
            filePath: filePath,
            absolutePath: path.resolve(filePath),
            fileExists: fs.existsSync(filePath),
            fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 'file not found',
            mimeType: mimeType,
            isVideo: isVideo,
            isMemoryVerse: originalFilename.toLowerCase().includes('memory_verse')
          });
          
          // For memory verse and miscellaneous videos, ensure we preserve the file exactly as is
          if (originalFilename.toLowerCase().includes('memory_verse') || 
              (originalFilename.toLowerCase().includes('miscellaneous') && isVideoByExtension)) {
            console.log(`${originalFilename.toLowerCase().includes('memory_verse') ? 'Memory verse' : 'Miscellaneous'} video detected, ensuring direct file copy`);
            
            // Just ensure the file exists in the correct uploads folder
            const uploadsFilePath = path.join(this.baseDir, safeFilename);
            if (filePath !== uploadsFilePath && fs.existsSync(filePath)) {
              try {
                fs.copyFileSync(filePath, uploadsFilePath);
                console.log(`Copied video to proper location: ${uploadsFilePath}`);
              } catch (copyError) {
                console.error("Error copying video:", copyError);
              }
            }
            
            // We need to ensure the thumbnail exists with the proper naming convention and in the proper location
            console.log(`Ensuring video thumbnail exists with proper naming`);
          }
          
          try {
            // Create memory verse video thumbnail
            await this.createVideoThumbnail(filePath, thumbnailPath);
            thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
            console.log(`Video thumbnail created at ${thumbnailPath}`);
            logger.info(`Created video thumbnail for ${safeFilename}`);
            
            // Double-check the thumbnail was created
            if (fs.existsSync(thumbnailPath)) {
              console.log(`Verified thumbnail exists at ${thumbnailPath}`);
              
              // Set proper file permissions
              try {
                fs.chmodSync(thumbnailPath, 0o644);
                console.log(`Set proper permissions on thumbnail file: ${thumbnailPath}`);
              } catch (permErr) {
                console.error(`Error setting permissions on thumbnail:`, permErr);
              }
              
              // For memory verse and miscellaneous videos, always ensure thumbnail is in the standard location
              if (originalFilename.toLowerCase().includes('memory_verse') || 
                  (originalFilename.toLowerCase().includes('miscellaneous') && isVideoByExtension)) {
                
                // Special handling for videos - create a copy without the thumb- prefix too
                // This is because some parts of the code might look for thumbnails without the prefix
                const thumbDirResolved = path.resolve(this.thumbnailDir);
                const alternateThumbPath = path.join(thumbDirResolved, safeFilename);
                if (!fs.existsSync(alternateThumbPath)) {
                  try {
                    fs.copyFileSync(thumbnailPath, alternateThumbPath);
                    console.log(`Created alternate video thumbnail at ${alternateThumbPath}`);
                  } catch (copyError) {
                    console.error(`Error creating alternate video thumbnail:`, copyError);
                  }
                }
              }
            } else {
              console.warn(`Thumbnail was not found at ${thumbnailPath} after creation attempt`);
              
              // Create a simple SVG thumbnail as fallback
              const svgContent = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#000"/>
                <text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text>
                <circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
                <polygon points="290,180 290,220 320,200" fill="#fff"/>
              </svg>`;
              
              fs.writeFileSync(thumbnailPath, svgContent);
              console.log(`Created SVG fallback thumbnail at ${thumbnailPath}`);
              
              // Create a copy without the thumb- prefix for memory verse or miscellaneous videos
              if (originalFilename.toLowerCase().includes('memory_verse') || 
                  (originalFilename.toLowerCase().includes('miscellaneous') && isVideoByExtension)) {
                const alternateThumbPath = path.join(this.thumbnailDir, safeFilename);
                try {
                  fs.writeFileSync(alternateThumbPath, svgContent);
                  console.log(`Created SVG fallback alternate thumbnail at ${alternateThumbPath}`);
                } catch (fallbackError) {
                  console.error(`Failed to create alternate thumbnail:`, fallbackError);
                }
              }
            }
          } catch (videoThumbError) {
            console.error(`Error in video thumbnail creation:`, videoThumbError);
            
            // Create a simple SVG thumbnail as fallback on error
            const svgContent = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
              <rect width="100%" height="100%" fill="#000"/>
              <text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text>
              <circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
              <polygon points="290,180 290,220 320,200" fill="#fff"/>
            </svg>`;
            
            fs.writeFileSync(thumbnailPath, svgContent);
            console.log(`Created SVG fallback thumbnail after error at ${thumbnailPath}`);
          }
        }
        
        // Verify that the thumbnail was created
        if (thumbnailUrl && !fs.existsSync(thumbnailPath)) {
          console.error(`Thumbnail was not created at ${thumbnailPath} despite no errors`);
          // Copy the original as a fallback
          fs.copyFileSync(filePath, thumbnailPath);
          console.log(`Created fallback thumbnail by copying original file to ${thumbnailPath}`);
          logger.info(`Created fallback thumbnail for ${safeFilename} by copying original file`);
        }
      } catch (thumbnailError) {
        console.error(`Error creating thumbnail for ${safeFilename}:`, thumbnailError);
        logger.error(`Error creating thumbnail for ${safeFilename}:`, thumbnailError);
        
        // Try a fallback approach - copy the original file as the thumbnail
        try {
          console.log(`Attempting to create a fallback thumbnail for ${safeFilename}`);
          fs.copyFileSync(filePath, thumbnailPath);
          thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
          console.log(`Created fallback thumbnail by copying original file to ${thumbnailPath}`);
          logger.info(`Created fallback thumbnail for ${safeFilename} after error`);
        } catch (fallbackError) {
          console.error(`Failed to create fallback thumbnail:`, fallbackError);
          logger.error(`Failed to create fallback thumbnail:`, fallbackError);
          thumbnailUrl = null;
        }
      }

      logger.info(`Successfully stored file ${safeFilename}`);

      // Determine which URL path should be used based on directory structure
      let urlPath = `/uploads/${safeFilename}`;
      
      // Use the same logic as above for directory paths
      if (isMemoryVideo) {
        urlPath = `/uploads/memory_verse/${safeFilename}`;
        console.log("Using memory_verse URL path:", urlPath);
      } else if (isMiscVideo) {
        urlPath = `/uploads/miscellaneous/${safeFilename}`;
        console.log("Using miscellaneous URL path:", urlPath);
      }
      
      return {
        url: urlPath,
        thumbnailUrl,
        filename: safeFilename,
        mimeType,
        size: stats.size,
        path: filePath
      };
    } catch (error) {
      logger.error('Error storing file:', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to store file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates a thumbnail version of an image
   * @param sourcePath Path to source image
   * @param targetPath Path to save thumbnail
   * @returns Promise that resolves when thumbnail is created
   */
  private async createThumbnail(sourcePath: string, targetPath: string): Promise<void> {
    try {
      console.log(`Attempting to create thumbnail from ${sourcePath} to ${targetPath}`);
      
      // Check if source file exists
      if (!fs.existsSync(sourcePath)) {
        console.error(`Source file not found: ${sourcePath}`);
        logger.error(`Source file not found: ${sourcePath}`);
        throw new Error(`Source file not found: ${sourcePath}`);
      }
      
      // Make sure the thumbnails directory exists
      const thumbnailDir = path.dirname(targetPath);
      if (!fs.existsSync(thumbnailDir)) {
        console.log(`Creating thumbnails directory: ${thumbnailDir}`);
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }
      
      // Create a thumbnail that's max 600px wide but maintains aspect ratio
      await sharp(sourcePath)
        .resize({
          width: 600,
          height: 600,
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFile(targetPath);

      console.log(`Successfully created thumbnail at ${targetPath}`);
      logger.info(`Created thumbnail at ${targetPath}`);
      
      // Verify thumbnail was created
      if (!fs.existsSync(targetPath)) {
        console.error(`Thumbnail file was not created at ${targetPath} despite no errors`);
        logger.error(`Thumbnail file was not created at ${targetPath} despite no errors`);
        throw new Error('Thumbnail was not created');
      }
    } catch (error) {
      console.error('Error creating thumbnail:', error);
      logger.error('Error creating thumbnail:', error instanceof Error ? error : new Error(String(error)));
      
      // Instead of failing the whole process, we'll log the error and create a basic thumbnail
      try {
        console.log('Attempting to create a basic fallback thumbnail');
        // Simple copy of the original as a fallback
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Created fallback thumbnail by copying original file to ${targetPath}`);
        logger.info(`Created fallback thumbnail by copying original file to ${targetPath}`);
      } catch (fallbackError) {
        console.error('Failed to create fallback thumbnail:', fallbackError);
        logger.error('Failed to create fallback thumbnail:', fallbackError);
        throw new Error('Failed to create thumbnail and fallback');
      }
    }
  }

  /**
   * Creates a thumbnail from a video file
   * @param videoPath Path to source video
   * @param targetPath Path to save thumbnail
   * @returns Promise that resolves when thumbnail is created
   */
  private async createVideoThumbnail(videoPath: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Attempting to create video thumbnail from ${videoPath} to ${targetPath}`);
        
        // Check if source file exists with detailed logging
        if (!fs.existsSync(videoPath)) {
          const error = new Error(`Source video file not found: ${videoPath}`);
          console.error(error.message);
          logger.error(error.message);
          
          // Check if the directory exists
          const dir = path.dirname(videoPath);
          console.log(`Directory exists for video path: ${fs.existsSync(dir)}, path: ${dir}`);
          
          // Try to list files in the directory to see what's actually there
          try {
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              console.log(`Files in directory ${dir}:`, files);
            }
          } catch (readDirError) {
            console.error(`Error listing directory ${dir}:`, readDirError);
          }
          
          // Try to find the video in alternative locations (for memory verse or miscellaneous videos)
          const filename = path.basename(videoPath);
          const isMemoryVerse = filename.toLowerCase().includes('memory_verse');
          const isMiscellaneousVideo = filename.toLowerCase().includes('miscellaneous');
          
          if (isMemoryVerse || isMiscellaneousVideo) {
            // Look for the file in common alternate locations
            const alternateLocations = [
              path.join(process.cwd(), 'uploads', filename),
              path.join(process.cwd(), 'uploads', 'videos', filename),
              path.join(process.cwd(), 'uploads', 'memory_verse', filename),
              path.join(process.cwd(), 'uploads', 'miscellaneous', filename)
            ];
            
            console.log(`Checking alternate locations for ${isMemoryVerse ? 'memory verse' : 'miscellaneous'} video: ${filename}`);
            let foundAlternate = false;
            
            for (const alternate of alternateLocations) {
              console.log(`Checking alternate path: ${alternate}`);
              if (fs.existsSync(alternate)) {
                console.log(`Found video at alternate path: ${alternate}`);
                // Use this path instead
                videoPath = alternate;
                foundAlternate = true;
                break;
              }
            }
            
            if (foundAlternate) {
              console.log(`Using alternate video path: ${videoPath}`);
            } else {
              console.error(`Could not find video in any alternate locations`);
              reject(error);
              return;
            }
          } else {
            reject(error);
            return;
          }
        }
        
        // Log file details
        try {
          const stats = fs.statSync(videoPath);
          console.log(`Video file stats:`, {
            size: stats.size,
            isFile: stats.isFile(),
            created: stats.birthtime,
            absolutePath: path.resolve(videoPath)
          });
        } catch (statError) {
          console.error(`Error getting video file stats: ${statError}`);
        }
        
        // Make sure the thumbnails directory exists
        const thumbnailDir = path.dirname(targetPath);
        if (!fs.existsSync(thumbnailDir)) {
          console.log(`Creating thumbnails directory: ${thumbnailDir}`);
          fs.mkdirSync(thumbnailDir, { recursive: true });
        }
        
        // Special handling for video types - ensure the path is correct
        const filename = path.basename(videoPath);
        const isMemoryVerseFilename = filename.toLowerCase().includes('memory_verse');
        const isMiscellaneousVideoFilename = filename.toLowerCase().includes('miscellaneous');
        
        // For memory verse or miscellaneous videos, copy the file to uploads directory if needed
        if (isMemoryVerseFilename || isMiscellaneousVideoFilename) {
          const uploadsDir = path.join(process.cwd(), 'uploads');
          const correctPath = path.join(uploadsDir, filename);
          
          if (videoPath !== correctPath && fs.existsSync(videoPath)) {
            try {
              // Copy to the main uploads directory if it's not already there
              if (!fs.existsSync(correctPath)) {
                fs.copyFileSync(videoPath, correctPath);
                console.log(`Copied ${isMemoryVerseFilename ? 'memory verse' : 'miscellaneous'} video to correct uploads location: ${correctPath}`);
              }
            } catch (copyError) {
              console.error(`Error copying video to correct location:`, copyError);
            }
          }
        }
        
        ffmpeg(videoPath)
          .on('error', (err: Error | undefined) => {
            const errorMessage = err ? err.message : 'Unknown error';
            console.error(`Error generating video thumbnail: ${errorMessage}`);
            logger.error(`Error generating video thumbnail: ${errorMessage}`);
            
            // Try to create a basic thumbnail as fallback
            try {
              // Use sharp to create a blank thumbnail with text as fallback
              const textBuffer = Buffer.from('<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text><circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/><polygon points="290,180 290,220 320,200" fill="#fff"/></svg>');
              fs.writeFileSync(targetPath, textBuffer);
              console.log(`Created fallback video thumbnail at ${targetPath}`);
              logger.info(`Created fallback video thumbnail at ${targetPath}`);
              
              // Ensure thumbnails directory is accessible with proper permissions
              try {
                const thumbnailsDir = path.dirname(targetPath);
                fs.chmodSync(thumbnailsDir, 0o755);
                fs.chmodSync(targetPath, 0o644);
                console.log(`Set proper permissions on thumbnail file and directory`);
              } catch (permissionError) {
                console.error(`Error setting permissions:`, permissionError);
              }
              
              resolve(); // Continue even with the fallback
            } catch (fallbackError) {
              console.error('Failed to create fallback video thumbnail:', fallbackError);
              reject(new Error(`Failed to generate video thumbnail: ${errorMessage}`));
            }
          })
          .on('end', () => {
            console.log(`Successfully created video thumbnail at ${targetPath}`);
            logger.info(`Created video thumbnail at ${targetPath}`);
            
            // Verify thumbnail was created
            if (!fs.existsSync(targetPath)) {
              console.error(`Video thumbnail file was not created at ${targetPath} despite no errors`);
              logger.error(`Video thumbnail file was not created at ${targetPath} despite no errors`);
              
              // Create a fallback
              try {
                const textBuffer = Buffer.from('<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text><circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/><polygon points="290,180 290,220 320,200" fill="#fff"/></svg>');
                fs.writeFileSync(targetPath, textBuffer);
                console.log(`Created fallback video thumbnail at ${targetPath} (verification stage)`);
                logger.info(`Created fallback video thumbnail at ${targetPath} (verification stage)`);
              } catch (fallbackError) {
                console.error('Failed to create fallback video thumbnail during verification:', fallbackError);
              }
            }
            
            // Set proper permissions on the thumbnail file
            try {
              fs.chmodSync(targetPath, 0o644);
            } catch (permErr) {
              console.error(`Error setting permissions on thumbnail:`, permErr);
            }
            
            resolve();
          })
          .screenshots({
            timestamps: ['00:00:01.000'], // Take screenshot at 1 second
            filename: path.basename(targetPath),
            folder: path.dirname(targetPath),
            size: '600x?', // Width 600px, height auto-calculated to maintain aspect ratio
          });
      } catch (error) {
        console.error('Error creating video thumbnail:', error);
        logger.error('Error creating video thumbnail:', error instanceof Error ? error : new Error(String(error)));
        
        // Try to create a basic thumbnail as fallback
        try {
          // Use direct file approach to create a basic thumbnail
          const textBuffer = Buffer.from('<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text><circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/><polygon points="290,180 290,220 320,200" fill="#fff"/></svg>');
          fs.writeFileSync(targetPath, textBuffer);
          console.log(`Created fallback video thumbnail at ${targetPath} (catch block)`);
          logger.info(`Created fallback video thumbnail at ${targetPath} (catch block)`);
          resolve(); // Continue even with the fallback
        } catch (fallbackError) {
          console.error('Failed to create fallback video thumbnail in catch block:', fallbackError);
          reject(new Error('Failed to create video thumbnail and fallback'));
        }
      }
    });
  }

  /**
   * Deletes a file by its URL
   * @param fileUrl URL of the file to delete (e.g., /uploads/filename.jpg)
   * @returns Promise that resolves when file is deleted
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (!fileUrl) {
        logger.warn('Attempted to delete null file URL');
        return;
      }

      console.log(`Attempting to delete file from URL: ${fileUrl}`);

      // Extract filename from URL
      const filename = path.basename(fileUrl);
      const filePath = path.join(this.baseDir, filename);

      console.log(`Looking for file at path: ${filePath}`);

      // Try to find the file with multiple approaches
      let foundFile = false;
      
      // Check if this is a memory verse or miscellaneous video
      const isMemoryVerse = filename.toLowerCase().includes('memory_verse');
      
      // For miscellaneous, check both the name and the file extension
      const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
      const fileExt = path.extname(filename).toLowerCase();
      const isMiscellaneousVideo = filename.toLowerCase().includes('miscellaneous') || 
                                  (videoExtensions.includes(fileExt) && !isMemoryVerse);
      
      // List of paths to check for videos
      const pathsToCheck = [filePath];
      
      // Add additional paths for special video types
      if (isMemoryVerse || isMiscellaneousVideo) {
        console.log(`Detected special video type: ${isMemoryVerse ? 'memory_verse' : 'miscellaneous'}`);
        
        // Add standard locations where videos might be stored
        pathsToCheck.push(
          path.join(this.baseDir, 'videos', filename),
          path.join(process.cwd(), 'uploads', filename)
        );
        
        if (isMemoryVerse) {
          pathsToCheck.push(
            path.join(this.baseDir, 'memory_verse', filename),
            path.join(process.cwd(), 'uploads', 'memory_verse', filename)
          );
        }
        
        if (isMiscellaneousVideo) {
          pathsToCheck.push(
            path.join(this.baseDir, 'miscellaneous', filename),
            path.join(process.cwd(), 'uploads', 'miscellaneous', filename)
          );
        }
      }
      
      // Try all potential paths
      for (const pathToCheck of pathsToCheck) {
        if (fs.existsSync(pathToCheck)) {
          try {
            fs.unlinkSync(pathToCheck);
            console.log(`Deleted file ${filename} from path: ${pathToCheck}`);
            logger.info(`Deleted file ${filename} from path: ${pathToCheck}`);
            foundFile = true;
          } catch (err) {
            console.error(`Error deleting file at ${pathToCheck}:`, err);
          }
        }
      }
      
      // If we haven't found the file in any of the specific paths, continue with pattern matching
      if (!foundFile) {
        console.log(`File not found in standard paths, trying pattern matching...`);
        
        // Try to find similar files in the uploads directory
        try {
          const filesInDir = fs.readdirSync(this.baseDir);
          console.log(`Found ${filesInDir.length} files in ${this.baseDir}`);
          
          // Look for files that might match our filename pattern
          // This helps with timestamp-based filenames where the exact match might not be found
          const possibleMatches = filesInDir.filter(file => {
            // For timestamp-based files, check if the second part of the name matches
            if (filename.includes('-')) {
              const filenameParts = filename.split('-');
              const secondPart = filenameParts.length > 1 ? filenameParts[1] : '';
              
              if (secondPart && file.includes(secondPart)) {
                return true;
              }
            }
            
            // For memory verse and miscellaneous video files specifically
            if ((filename.includes('memory_verse') && file.includes('memory_verse')) ||
                (filename.includes('miscellaneous') && file.includes('miscellaneous'))) {
              return true;
            }
            
            // Check for file extension match as a fallback
            const ext = path.extname(filename);
            if (ext && file.endsWith(ext)) {
              // Additional check: created around the same time (if timestamp-based)
              const filenameMatch = filename.match(/^\d+/);
              const fileMatch = file.match(/^\d+/);
              if (filenameMatch && fileMatch) {
                const filenameTime = parseInt(filenameMatch[0]);
                const fileTime = parseInt(fileMatch[0]);
                
                // If files were created within 10 seconds of each other
                if (Math.abs(filenameTime - fileTime) < 10000) {
                  return true;
                }
              }
            }
            
            return false;
          });
          
          console.log(`Found ${possibleMatches.length} possible matches:`, possibleMatches);
          
          // Try to delete all possible matches
          for (const match of possibleMatches) {
            const matchPath = path.join(this.baseDir, match);
            try {
              fs.unlinkSync(matchPath);
              console.log(`Deleted possible match: ${matchPath}`);
              logger.info(`Deleted possible match file: ${match}`);
              foundFile = true;
            } catch (err) {
              console.error(`Error deleting possible match at ${matchPath}:`, err);
            }
          }
        } catch (readErr) {
          console.error(`Error reading directory ${this.baseDir}:`, readErr);
        }
      }
      
      // Try to delete thumbnails regardless of whether we found the original file
      try {
        // List of thumbnail paths to check
        const thumbnailPathsToCheck = [
          // Standard thumbnail with thumb- prefix
          path.join(this.thumbnailDir, `thumb-${filename}`),
          // Alternate thumbnail without the thumb- prefix
          path.join(this.thumbnailDir, filename)
        ];
        
        // Add special thumbnail locations for memory verse and miscellaneous videos
        if (isMemoryVerse || isMiscellaneousVideo) {
          // For videos, try png and jpg extensions
          const baseFilename = filename.substring(0, filename.lastIndexOf('.')) || filename;
          thumbnailPathsToCheck.push(
            path.join(this.thumbnailDir, `${baseFilename}.jpg`),
            path.join(this.thumbnailDir, `${baseFilename}.png`),
            path.join(this.thumbnailDir, `thumb-${baseFilename}.jpg`),
            path.join(this.thumbnailDir, `thumb-${baseFilename}.png`)
          );
          
          // For memory verse videos, check special directories
          if (isMemoryVerse) {
            thumbnailPathsToCheck.push(
              path.join(this.thumbnailDir, 'memory_verse', filename),
              path.join(this.thumbnailDir, 'memory_verse', `thumb-${filename}`),
              path.join(process.cwd(), 'uploads', 'thumbnails', 'memory_verse', filename),
              path.join(process.cwd(), 'uploads', 'thumbnails', 'memory_verse', `thumb-${filename}`)
            );
          }
          
          // For miscellaneous videos, check special directories
          if (isMiscellaneousVideo) {
            thumbnailPathsToCheck.push(
              path.join(this.thumbnailDir, 'miscellaneous', filename),
              path.join(this.thumbnailDir, 'miscellaneous', `thumb-${filename}`),
              path.join(process.cwd(), 'uploads', 'thumbnails', 'miscellaneous', filename),
              path.join(process.cwd(), 'uploads', 'thumbnails', 'miscellaneous', `thumb-${filename}`)
            );
          }
        }
        
        // Check and delete all thumbnail paths
        for (const thumbPath of thumbnailPathsToCheck) {
          if (fs.existsSync(thumbPath)) {
            try {
              fs.unlinkSync(thumbPath);
              console.log(`Deleted thumbnail at ${thumbPath}`);
              logger.info(`Deleted thumbnail at ${thumbPath}`);
              foundFile = true;
            } catch (err) {
              console.error(`Error deleting thumbnail at ${thumbPath}:`, err);
            }
          }
        }
        
        // For files with timestamps, try to find approximate matches
        const filesInThumbDir = fs.readdirSync(this.thumbnailDir);
        
        // Same matching logic as above for similar filenames
        const possibleThumbMatches = filesInThumbDir.filter(file => {
          if (filename.includes('-')) {
            const filenameParts = filename.split('-');
            const secondPart = filenameParts.length > 1 ? filenameParts[1] : '';
            
            if (secondPart && file.includes(secondPart)) {
              return true;
            }
          }
          
          // For memory verse and miscellaneous video files specifically in thumbnail directory
          if ((filename.includes('memory_verse') && file.includes('memory_verse')) ||
              (filename.includes('miscellaneous') && file.includes('miscellaneous'))) {
            return true;
          }
          
          const ext = path.extname(filename);
          if (ext && file.endsWith(ext)) {
            return true;
          }
          
          return false;
        });
        
        for (const match of possibleThumbMatches) {
          const matchPath = path.join(this.thumbnailDir, match);
          try {
            fs.unlinkSync(matchPath);
            console.log(`Deleted possible thumbnail match: ${matchPath}`);
            logger.info(`Deleted possible thumbnail match: ${match}`);
            foundFile = true;
          } catch (err) {
            console.error(`Error deleting possible thumbnail match at ${matchPath}:`, err);
          }
        }
      } catch (thumbErr) {
        console.error(`Error handling thumbnails:`, thumbErr);
      }
      
      if (!foundFile) {
        console.warn(`No files found for deletion matching: ${filename}`);
        logger.warn(`No files found for deletion matching: ${filename}`);
      }
    } catch (error) {
      console.error('Error in deleteFile:', error);
      logger.error('Error deleting file:', error instanceof Error ? error : new Error(String(error)));
      // Don't throw error, just log it - we don't want to prevent post deletion
    }
  }

  /**
   * Get file information by URL
   * @param fileUrl URL of the file
   * @returns File information or null if not found
   */
  getFileInfo(fileUrl: string): { 
    url: string;
    thumbnailUrl: string | null;
    filename: string;
    mimeType: string | null;
    size: number;
    path: string;
  } | null {
    try {
      if (!fileUrl) return null;

      // Extract filename from URL
      const filename = path.basename(fileUrl);
      const filePath = path.join(this.baseDir, filename);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      // Get file stats
      const stats = fs.statSync(filePath);

      // Determine mime type based on extension (simplified)
      const ext = path.extname(filename).toLowerCase();
      let mimeType = null;

      if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.webm') mimeType = 'video/webm';


      // Check if thumbnail exists
      const thumbnailFilename = `thumb-${filename}`;
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);
      const thumbnailUrl = fs.existsSync(thumbnailPath) ? `/uploads/thumbnails/${thumbnailFilename}` : null;

      return {
        url: fileUrl,
        thumbnailUrl,
        filename,
        mimeType,
        size: stats.size,
        path: filePath
      };
    } catch (error) {
      logger.error('Error getting file info:', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
}

// Export singleton instance
export const spartaStorage = new SpartaObjectStorage();