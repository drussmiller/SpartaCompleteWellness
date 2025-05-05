import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import ffmpeg from 'fluent-ffmpeg';
import { Client as ObjectStorageClient } from '@replit/object-storage';

/**
 * SpartaObjectStorage provides a unified interface for handling file objects
 * such as images and other media files with proper error handling and logging.
 * It supports both filesystem storage and Replit Object Storage for cross-environment compatibility.
 */
export class SpartaObjectStorage {
  private baseDir: string;
  private thumbnailDir: string;
  private allowedTypes: string[];
  private objectStorage: ObjectStorageClient | null = null;
  private isProductionEnv: boolean = process.env.NODE_ENV === 'production';

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
    this.isProductionEnv = process.env.NODE_ENV === 'production';

    // Initialize Replit Object Storage
    try {
      this.objectStorage = new ObjectStorageClient();
      console.log("Replit Object Storage initialized successfully");
    } catch (error) {
      console.warn("Failed to initialize Replit Object Storage, falling back to local storage:", error);
      this.objectStorage = null;
    }

    // Ensure we're using absolute paths to avoid any path resolution issues
    console.log("SpartaObjectStorage initialized with paths:", {
      baseDir: this.baseDir,
      thumbnailDir: this.thumbnailDir,
      cwd: process.cwd(),
      absoluteBaseDir: path.resolve(this.baseDir),
      absoluteThumbnailDir: path.resolve(this.thumbnailDir),
      objectStorageEnabled: !!this.objectStorage,
      environment: this.isProductionEnv ? 'production' : 'development'
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
   * Store a buffer directly as a file
   * @param buffer Buffer containing file data
   * @param filename Filename to store with (should include the extension)
   * @param mimeType MIME type of the file
   * @returns Promise with the URL of the stored file
   */
  async storeBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    try {
      // Ensure the buffer is valid
      if (!buffer || buffer.length === 0) {
        throw new Error('Invalid buffer provided for storing');
      }

      logger.info(`Storing buffer as ${filename}, size: ${buffer.length} bytes, mime: ${mimeType}`);

      // Generate object storage key for the file - use shared uploads path for everything
      const sharedKey = `shared/uploads/${filename}`;
      
      // Store in Object Storage if available
      if (this.objectStorage) {
        await this.objectStorage.uploadFromBytes(sharedKey, buffer);
        logger.info(`Stored buffer to Object Storage: ${sharedKey}`);
      }
      
      // Local filesystem path
      const localPath = path.join(this.baseDir, filename);
      
      // Ensure directory exists
      const dirname = path.dirname(localPath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      
      // Store locally as a backup
      fs.writeFileSync(localPath, buffer);
      logger.info(`Stored buffer to filesystem: ${localPath}`);
      
      // Return the public URL
      return `/uploads/${filename}`;
    } catch (error) {
      logger.error(`Error storing buffer as ${filename}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
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
    isVideo: boolean = false,
    thumbnailPath?: string
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
        console.log(`Attempting to write file, buffer size: ${fileBuffer.length}`);
        
        // First, store in object storage if available
        let objectStorageKey = '';
        
        if (this.objectStorage) {
          try {
            // Create a key based on path structure to maintain same organization
            // Create environment-agnostic keys by removing env-specific parts
            const relativePath = filePath.replace(this.baseDir, '').replace(/^\/+/, '');
            
            // Only store with shared key to save space
            // The environment-agnostic key has 'shared/' prefix and works across environments
            const sharedKey = `shared/uploads/${relativePath}`;
            
            logger.info(`Object Storage: Storing file with shared key`, {
              sharedKey,
              fileSize: fileBuffer.length,
              mimeType
            });
            
            // Store only with shared key to save space
            console.log(`Storing file in Replit Object Storage with shared key: ${sharedKey}`);
            await this.objectStorage.uploadFromBytes(sharedKey, fileBuffer);
            
            // Use the shared key for URLs
            objectStorageKey = sharedKey;
            console.log(`File stored successfully in Replit Object Storage with shared key`);
            logger.info(`File stored successfully with shared key`, {
              sharedKey,
              fileSize: fileBuffer.length
            });
          } catch (objStorageError) {
            console.error(`Error storing file in Replit Object Storage:`, objStorageError);
            logger.error(`Error storing file in Replit Object Storage:`, objStorageError);
            // Continue with local storage as fallback
          }
        }
        
        // Store locally only if Object Storage is not available
        if (!this.objectStorage) {
          fs.writeFileSync(filePath, fileBuffer);
          console.log(`File written successfully to ${filePath} (Object Storage not available)`);
          logger.info(`File written successfully to ${filePath} (Object Storage not available)`);
        } else {
          console.log(`Skipping local file storage to save space, using Object Storage only`);
          logger.info(`Skipping local file storage to save space, using Object Storage only`);
        }
      } catch (writeError) {
        console.error(`Error writing file to ${filePath}:`, writeError);
        logger.error(`Error writing file to ${filePath}:`, writeError);
        throw writeError;
      }

      // Get file size or use buffer size if the file doesn't exist on disk
      let fileSize = 0;
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
      } else {
        fileSize = fileBuffer.length;
      }
      logger.info(`File size: ${fileSize} bytes`);

      let thumbnailUrl = null;

      // Create thumbnail based on file type
      const thumbnailFilename = `thumb-${safeFilename}`;
      const thumbnailDirPath = path.resolve(this.thumbnailDir);
      const generatedThumbnailPath = path.join(thumbnailDirPath, thumbnailFilename);
      
      // Log if a custom thumbnail path was provided
      console.log(`Thumbnail preparation:`, {
        providedThumbnailPath: thumbnailPath,
        generatedThumbnailPath,
        thumbnailDirPath,
        originalDir: this.thumbnailDir,
        hasThumbnail: !!thumbnailPath
      });

      try {
        // Ensure thumbnail directory exists
        if (!fs.existsSync(thumbnailDirPath)) {
          console.log(`Creating thumbnails directory: ${thumbnailDirPath}`);
          fs.mkdirSync(thumbnailDirPath, { recursive: true });
        }
        
        // If a custom thumbnail is provided, use it instead of generating one
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          console.log(`Using provided thumbnail: ${thumbnailPath}`);
          
          // Copy the provided thumbnail to our standard location
          fs.copyFileSync(thumbnailPath, generatedThumbnailPath);
          thumbnailUrl = `/shared/uploads/thumbnails/${thumbnailFilename}`;
          console.log(`Copied provided thumbnail to standard location: ${generatedThumbnailPath}`);
          logger.info(`Using provided thumbnail for ${safeFilename}`);
        } else if (mimeType.startsWith('image/')) {
          // Process image thumbnail
          console.log(`Processing image thumbnail for ${safeFilename}`);
          await this.createThumbnail(filePath, generatedThumbnailPath);
          thumbnailUrl = `/shared/uploads/thumbnails/${thumbnailFilename}`;
          console.log(`Image thumbnail created at ${generatedThumbnailPath}`);
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
            isMemoryVerse: originalFilename.toLowerCase().includes('memory_verse'),
            hasProvidedThumbnail: !!thumbnailPath
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
            await this.createVideoThumbnail(filePath, generatedThumbnailPath);
            thumbnailUrl = `/shared/uploads/thumbnails/${thumbnailFilename}`;
            console.log(`Video thumbnail created at ${generatedThumbnailPath}`);
            logger.info(`Created video thumbnail for ${safeFilename}`);
            
            // Double-check the thumbnail was created
            if (fs.existsSync(generatedThumbnailPath)) {
              console.log(`Verified thumbnail exists at ${generatedThumbnailPath}`);
              
              // Set proper file permissions
              try {
                fs.chmodSync(generatedThumbnailPath, 0o644);
                console.log(`Set proper permissions on thumbnail file: ${generatedThumbnailPath}`);
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
                    fs.copyFileSync(generatedThumbnailPath, alternateThumbPath);
                    console.log(`Created alternate video thumbnail at ${alternateThumbPath}`);
                  } catch (copyError) {
                    console.error(`Error creating alternate video thumbnail:`, copyError);
                  }
                }
              }
            } else {
              console.warn(`Thumbnail was not found at ${generatedThumbnailPath} after creation attempt`);
              
              // Create a simple SVG thumbnail as fallback
              const svgContent = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#000"/>
                <text x="50%" y="50%" fill="#fff" text-anchor="middle" font-size="24">Video Preview</text>
                <circle cx="300" cy="200" r="50" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
                <polygon points="290,180 290,220 320,200" fill="#fff"/>
              </svg>`;
              
              fs.writeFileSync(generatedThumbnailPath, svgContent);
              console.log(`Created SVG fallback thumbnail at ${generatedThumbnailPath}`);
              
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
            
            fs.writeFileSync(generatedThumbnailPath, svgContent);
            console.log(`Created SVG fallback thumbnail after error at ${generatedThumbnailPath}`);
          }
        }
        
        // Verify that the thumbnail was created
        if (thumbnailUrl && !fs.existsSync(generatedThumbnailPath)) {
          console.error(`Thumbnail was not created at ${generatedThumbnailPath} despite no errors`);
          // Copy the original as a fallback
          fs.copyFileSync(filePath, generatedThumbnailPath);
          console.log(`Created fallback thumbnail by copying original file to ${generatedThumbnailPath}`);
          logger.info(`Created fallback thumbnail for ${safeFilename} by copying original file`);
        }
        
        // Now that thumbnail is created (or fallback is in place), upload to Object Storage
        if (thumbnailUrl && fs.existsSync(generatedThumbnailPath) && this.objectStorage) {
          try {
            const thumbnailBasename = path.basename(generatedThumbnailPath);
            
            // Store only in the shared path to save space
            const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
            
            const thumbnailBuffer = fs.readFileSync(generatedThumbnailPath);
            
            // Upload with shared key only
            console.log(`Uploading thumbnail to Object Storage with shared key: ${sharedKey}`);
            await this.objectStorage.uploadFromBytes(sharedKey, thumbnailBuffer);
            
            console.log(`Successfully uploaded thumbnail to Object Storage with shared key`);
          } catch (objStoreError) {
            console.error(`Failed to upload thumbnail to Object Storage:`, objStoreError);
            // Continue with local thumbnail only
          }
        }
      } catch (thumbnailError) {
        console.error(`Error creating thumbnail for ${safeFilename}:`, thumbnailError);
        logger.error(`Error creating thumbnail for ${safeFilename}:`, thumbnailError);
        
        // Try a fallback approach - copy the original file as the thumbnail
        try {
          console.log(`Attempting to create a fallback thumbnail for ${safeFilename}`);
          fs.copyFileSync(filePath, generatedThumbnailPath);
          thumbnailUrl = `/shared/uploads/thumbnails/${thumbnailFilename}`;
          console.log(`Created fallback thumbnail by copying original file to ${generatedThumbnailPath}`);
          logger.info(`Created fallback thumbnail for ${safeFilename} after error`);
        } catch (fallbackError) {
          console.error(`Failed to create fallback thumbnail:`, fallbackError);
          logger.error(`Failed to create fallback thumbnail:`, fallbackError);
          thumbnailUrl = null;
        }
      }

      logger.info(`Successfully stored file ${safeFilename}`);

      // Determine which URL path should be used based on directory structure - ONLY use shared paths
      let urlPath = `/shared/uploads/${safeFilename}`;
      
      // Use the same logic as above for directory paths
      if (isMemoryVideo) {
        urlPath = `/shared/uploads/memory_verse/${safeFilename}`;
        console.log("Using shared memory_verse URL path:", urlPath);
      } else if (isMiscVideo) {
        urlPath = `/shared/uploads/miscellaneous/${safeFilename}`;
        console.log("Using shared miscellaneous URL path:", urlPath);
      }
      
      return {
        url: urlPath,
        thumbnailUrl,
        filename: safeFilename,
        mimeType,
        size: fileSize,
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
      
      // Check if source file exists locally
      if (!fs.existsSync(sourcePath) && this.objectStorage) {
        console.log(`Source file not found locally: ${sourcePath}. Attempting to retrieve from Object Storage.`);
        
        // Extract the filename and prepare possible keys - ONLY using shared paths
        const fileName = path.basename(sourcePath);
        const objectStorageKeys = [
          `shared/uploads/${fileName}`,
          fileName
        ];
        
        let foundKey = '';
        let fileBuffer: Buffer | null = null;
        
        // Try each potential key
        for (const key of objectStorageKeys) {
          try {
            console.log(`Checking if file exists in Object Storage with key: ${key}`);
            const exists = await this.objectStorage.exists(key);
            
            if (exists) {
              foundKey = key;
              console.log(`Found file in Object Storage with key: ${key}`);
              
              // Download the file
              console.log(`Downloading file from Object Storage with key: ${key}`);
              const result = await this.objectStorage.downloadAsBytes(key);
              
              // Handle different response formats from Object Storage client
              if (Buffer.isBuffer(result)) {
                fileBuffer = result;
              } else if (result && typeof result === 'object' && 'ok' in result) {
                if (result.ok === true && result.value) {
                  if (Buffer.isBuffer(result.value)) {
                    fileBuffer = result.value;
                  } else if (Array.isArray(result.value) && Buffer.isBuffer(result.value[0])) {
                    fileBuffer = result.value[0];
                  }
                }
              } else if (Array.isArray(result) && Buffer.isBuffer(result[0])) {
                fileBuffer = result[0];
              }
              
              if (fileBuffer) {
                console.log(`Successfully downloaded file from Object Storage (${fileBuffer.length} bytes)`);
                break;
              }
            }
          } catch (err) {
            console.log(`Error checking key ${key} in Object Storage:`, err);
          }
        }
        
        if (fileBuffer) {
          // Ensure source directory exists
          const sourceDir = path.dirname(sourcePath);
          if (!fs.existsSync(sourceDir)) {
            fs.mkdirSync(sourceDir, { recursive: true });
          }
          
          // Write the file locally
          fs.writeFileSync(sourcePath, fileBuffer);
          console.log(`Successfully downloaded and cached file from Object Storage to ${sourcePath}`);
        } else {
          console.error(`Could not find or download source file from Object Storage`);
          throw new Error(`Source file not found locally or in Object Storage: ${sourcePath}`);
        }
      } else if (!fs.existsSync(sourcePath)) {
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
      
      // Directly upload the thumbnail to Object Storage here
      if (this.objectStorage) {
        try {
          const thumbnailBasename = path.basename(targetPath);
          
          // Store only in shared path to save space
          const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
          
          const thumbnailBuffer = fs.readFileSync(targetPath);
          
          // Upload with shared key only
          console.log(`Uploading thumbnail to Object Storage with shared key: ${sharedKey}`);
          await this.objectStorage.uploadFromBytes(sharedKey, thumbnailBuffer);
          
          console.log(`Successfully uploaded thumbnail to Object Storage with shared key`);
        } catch (objStoreError) {
          console.error(`Failed to upload thumbnail to Object Storage:`, objStoreError);
          logger.error(`Failed to upload thumbnail to Object Storage:`, objStoreError);
          // Continue with local thumbnail only
        }
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
        
        // Try to upload the fallback thumbnail to Object Storage
        if (this.objectStorage) {
          try {
            const thumbnailBasename = path.basename(targetPath);
            
            // Store only in shared path to save space
            const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
            
            const thumbnailBuffer = fs.readFileSync(targetPath);
            
            // Upload with shared key only
            console.log(`Uploading fallback thumbnail to Object Storage with shared key: ${sharedKey}`);
            await this.objectStorage.uploadFromBytes(sharedKey, thumbnailBuffer);
            
            console.log(`Successfully uploaded fallback thumbnail to Object Storage with shared key`);
          } catch (objStoreError) {
            console.error(`Failed to upload fallback thumbnail to Object Storage:`, objStoreError);
            logger.error(`Failed to upload fallback thumbnail to Object Storage:`, objStoreError);
            // Continue with local thumbnail only
          }
        }
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
        
        // Use local variable to avoid multiple imports of the same module
        let movFrameExtractor: any = null;
      
      // Check if source file exists with detailed logging
      if (!fs.existsSync(videoPath)) {
        console.log(`Source video file not found locally: ${videoPath}`);
        
        // Try to find the video in Object Storage if available
        if (this.objectStorage) {
          console.log(`Attempting to retrieve video from Object Storage...`);
          
          const filename = path.basename(videoPath);
          const isMemoryVerse = filename.toLowerCase().includes('memory_verse');
          const isMiscellaneousVideo = filename.toLowerCase().includes('miscellaneous');
            
            // Prepare possible Object Storage keys to check - ONLY using shared paths
            let objectStorageKeys = [
              `shared/uploads/${filename}`,
              filename
            ];
            
            // Add special directory keys if needed
            if (isMemoryVerse) {
              objectStorageKeys.push(
                `shared/uploads/memory_verse/${filename}`,
                `memory_verse/${filename}`
              );
            } else if (isMiscellaneousVideo) {
              objectStorageKeys.push(
                `shared/uploads/miscellaneous/${filename}`,
                `miscellaneous/${filename}`
              );
            }
            
            // Also add video-specific paths
            objectStorageKeys.push(
              `shared/uploads/videos/${filename}`,
              `videos/${filename}`
            );
            
            console.log(`Checking Object Storage with keys:`, objectStorageKeys);
            
            // Try to find and download the video from Object Storage
            let foundInObjectStorage = false;
            let fileBuffer: Buffer | null = null;
            let foundKey = '';
            
            // We need to wrap this in a Promise to work with our Promise-based approach
            const checkObjectStorage = async () => {
              for (const key of objectStorageKeys) {
                try {
                  console.log(`Checking if video exists in Object Storage with key: ${key}`);
                  const exists = await this.objectStorage!.exists(key);
                  
                  if (exists) {
                    foundKey = key;
                    console.log(`Found video in Object Storage with key: ${key}`);
                    
                    // Download the file
                    console.log(`Downloading video from Object Storage with key: ${key}`);
                    const result = await this.objectStorage!.downloadAsBytes(key);
                    
                    // Handle different response formats from Object Storage client
                    if (Buffer.isBuffer(result)) {
                      fileBuffer = result;
                    } else if (result && typeof result === 'object' && 'ok' in result) {
                      if (result.ok === true && result.value) {
                        if (Buffer.isBuffer(result.value)) {
                          fileBuffer = result.value;
                        } else if (Array.isArray(result.value) && Buffer.isBuffer(result.value[0])) {
                          fileBuffer = result.value[0];
                        }
                      }
                    } else if (Array.isArray(result) && Buffer.isBuffer(result[0])) {
                      fileBuffer = result[0];
                    }
                    
                    if (fileBuffer) {
                      console.log(`Successfully downloaded video from Object Storage (${fileBuffer.length} bytes)`);
                      foundInObjectStorage = true;
                      break;
                    }
                  }
                } catch (err) {
                  console.log(`Error checking key ${key} in Object Storage:`, err);
                }
              }
              
              if (fileBuffer) {
                // Ensure source directory exists
                const sourceDir = path.dirname(videoPath);
                if (!fs.existsSync(sourceDir)) {
                  fs.mkdirSync(sourceDir, { recursive: true });
                }
                
                // Write the file locally
                fs.writeFileSync(videoPath, fileBuffer);
                console.log(`Successfully downloaded and cached video from Object Storage to ${videoPath}`);
                return true;
              }
              
              return false;
            };
            
            // Execute the async function and continue only if we found the file
            checkObjectStorage().then(found => {
              if (found) {
                // Continue with thumbnail generation
                continueWithThumbnailGeneration();
              } else {
                // Try local file fallbacks before giving up
                tryLocalFallbacks();
              }
            }).catch(objStoreError => {
              console.error(`Error accessing Object Storage:`, objStoreError);
              // Fall back to local file search
              tryLocalFallbacks();
            });
            
            // This function handles the actual thumbnail generation once we have the source file
            const continueWithThumbnailGeneration = () => {
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
                    // Ensure destination directory exists
                    if (!fs.existsSync(uploadsDir)) {
                      fs.mkdirSync(uploadsDir, { recursive: true });
                    }
                    // Copy the file to ensure it's in the right place
                    fs.copyFileSync(videoPath, correctPath);
                    console.log(`Copied video to standard uploads directory: ${correctPath}`);
                    
                    // Use the new path for thumbnail generation
                    videoPath = correctPath;
                  } catch (copyError) {
                    console.error(`Error copying video to standard uploads directory: ${copyError}`);
                  }
                }
              }
              
              // Now we can attempt to generate the thumbnail from the video
              console.log(`Generating thumbnail from video using ffmpeg: ${videoPath} -> ${targetPath}`);
              
              // Sometimes the video path contains spaces, so use the path module to normalize
              const normalizedVideoPath = path.normalize(videoPath);
              
              // Create a random ID for this process
              const processId = Math.random().toString(36).substring(2, 8);
              
              // Use ffmpeg to extract a thumbnail at 1 second
              // For MOV files, use a different approach to avoid issues
              const isMovFile = normalizedVideoPath.toLowerCase().endsWith('.mov');
              
              if (isMovFile) {
                console.log(`Special handling for MOV file: ${normalizedVideoPath}`);
                
                try {
                  // For MOV files, we need to use a more specific ffmpeg approach
                  // This will create actual frame captures instead of SVG placeholders
                  console.log(`Creating actual frame thumbnails for MOV file using ffmpeg: ${normalizedVideoPath}`);
                  
                  // First make sure the thumbnail directory exists
                  const thumbDir = path.dirname(targetPath);
                  if (!fs.existsSync(thumbDir)) {
                    fs.mkdirSync(thumbDir, { recursive: true });
                  }
                  
                  // Define output paths
                  const jpgThumbPath = targetPath.replace('.mov', '.jpg');
                  const posterFilename = filename.replace('.mov', '.poster.jpg');
                  const posterPath = path.join(path.dirname(videoPath), posterFilename);
                  const nonPrefixedThumbPath = targetPath.replace('thumb-', '');
                  
                  // Generate an actual frame capture using ffmpeg
                  // For MOV files we'll use more precise settings
                  const ffmpeg = require('fluent-ffmpeg');
                  
                  console.log(`Extracting first frame from MOV file at ${normalizedVideoPath}`);
                  
                  // Use a Promise to track the completion of ffmpeg
                  const generateFrameCapture = new Promise<void>((frameResolve, frameReject) => {
                    // Set a unique process ID for logging
                    const processId = Math.random().toString(36).substring(2, 8);
                    
                    // Configure ffmpeg with specific settings for MOV files
                    const command = ffmpeg(normalizedVideoPath)
                      .inputOptions([
                        '-ss 0', // Seek to the very beginning
                        '-t 0.1' // Limit input duration to improve speed
                      ])
                      .outputOptions([
                        '-frames:v 1', // Extract exactly one frame
                        '-q:v 2',      // High quality
                        '-f image2'    // Force image output format
                      ])
                      .on('start', (commandLine: string) => {
                        console.log(`[${processId}] MOV Extraction: ${commandLine}`);
                      })
                      .on('end', () => {
                        console.log(`[${processId}] Successfully extracted first frame from MOV file`);
                        frameResolve();
                      })
                      .on('error', (err: Error, stdout: string, stderr: string) => {
                        console.error(`[${processId}] Error extracting frame: ${err.message}`);
                        console.error(`[${processId}] ffmpeg stdout: ${stdout}`);
                        console.error(`[${processId}] ffmpeg stderr: ${stderr}`);
                        
                        // Create a fallback thumbnail if frame extraction fails
                        const videoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#3A57E8"/><circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/><text x="300" y="200" fill="#fff" text-anchor="middle" font-size="14">Video Thumbnail</text><polygon points="270,160 270,240 350,200" fill="#fff"/></svg>');
                        
                        try {
                          // Create all fallback versions
                          fs.writeFileSync(jpgThumbPath, videoSvg);
                          fs.writeFileSync(targetPath, videoSvg);
                          fs.writeFileSync(posterPath, videoSvg);
                          fs.writeFileSync(nonPrefixedThumbPath, videoSvg);
                          
                          console.log(`[${processId}] Created fallback thumbnails after ffmpeg error`);
                          frameResolve(); // Resolve even though we used fallbacks
                        } catch (fbError) {
                          console.error(`[${processId}] Failed to create fallback: ${fbError}`);
                          frameReject(fbError);
                        }
                      });
                    
                    // Execute ffmpeg to create the JPG thumbnail
                    command.save(jpgThumbPath);
                  });
                  
                  // Wait for frame capture to complete
                  generateFrameCapture.then(() => {
                    // Now copy the JPG thumbnail to all required locations
                    if (fs.existsSync(jpgThumbPath)) {
                      console.log(`Frame capture successful, creating additional thumbnail versions`);
                      const jpgBuffer = fs.readFileSync(jpgThumbPath);
                      
                      // Make copies for all required formats
                      fs.writeFileSync(targetPath, jpgBuffer);
                      fs.writeFileSync(posterPath, jpgBuffer);
                      fs.writeFileSync(nonPrefixedThumbPath, jpgBuffer);
                      
                      console.log(`Created all required thumbnail versions`);
                      
                      // Upload all created files to Object Storage
                      if (this.objectStorage) {
                        const thumbnailBasename = path.basename(targetPath);
                        const jpgThumbBasename = path.basename(jpgThumbPath);
                        const posterBasename = path.basename(posterPath);
                        const nonPrefixedBasename = path.basename(nonPrefixedThumbPath);
                        
                        // Store only in shared path to save space
                        const sharedThumbKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
                        const sharedJpgThumbKey = `shared/uploads/thumbnails/${jpgThumbBasename}`;
                        const sharedPosterKey = `shared/uploads/thumbnails/${posterBasename}`;
                        const sharedNonPrefixedKey = `shared/uploads/thumbnails/${nonPrefixedBasename}`;
                        
                        console.log(`Uploading MOV thumbnails to Object Storage with shared keys`);
                        
                        const uploadPromises = [
                          this.objectStorage.uploadFromBytes(sharedThumbKey, jpgBuffer)
                            .then(() => console.log(`Uploaded MOV thumbnail to ${sharedThumbKey}`))
                            .catch(e => console.error(`Failed to upload to ${sharedThumbKey}:`, e)),
                            
                          this.objectStorage.uploadFromBytes(sharedJpgThumbKey, jpgBuffer)
                            .then(() => console.log(`Uploaded JPG thumbnail to ${sharedJpgThumbKey}`))
                            .catch(e => console.error(`Failed to upload to ${sharedJpgThumbKey}:`, e)),
                            
                          this.objectStorage.uploadFromBytes(sharedPosterKey, jpgBuffer)
                            .then(() => console.log(`Uploaded poster to ${sharedPosterKey}`))
                            .catch(e => console.error(`Failed to upload to ${sharedPosterKey}:`, e)),
                            
                          this.objectStorage.uploadFromBytes(sharedNonPrefixedKey, jpgBuffer)
                            .then(() => console.log(`Uploaded non-prefixed thumbnail to ${sharedNonPrefixedKey}`))
                            .catch(e => console.error(`Failed to upload to ${sharedNonPrefixedKey}:`, e))
                        ];
                        
                        Promise.all(uploadPromises)
                          .then(() => console.log(`Successfully uploaded all MOV thumbnails to Object Storage`))
                          .catch(err => console.error('Error uploading thumbnails:', err));
                        
                        // Resolve the original promise since we've created the thumbnails
                        resolve();
                      } else {
                        resolve();
                      }
                    } else {
                      console.error(`Failed to create JPG thumbnail from MOV file at ${jpgThumbPath}`);
                      
                      // Create a fallback thumbnail if the JPG file doesn't exist
                      const videoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#3A57E8"/><circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/><text x="300" y="200" fill="#fff" text-anchor="middle" font-size="14">Video Thumbnail</text><polygon points="270,160 270,240 350,200" fill="#fff"/></svg>');
                      
                      // Create all required versions
                      try {
                        fs.writeFileSync(jpgThumbPath, videoSvg);
                        fs.writeFileSync(targetPath, videoSvg);
                        fs.writeFileSync(posterPath, videoSvg);
                        fs.writeFileSync(nonPrefixedThumbPath, videoSvg);
                        
                        console.log(`Created fallback thumbnails after ffmpeg failure`);
                        resolve();
                      } catch(fbError) {
                        console.error(`Failed to create fallback thumbnails: ${fbError}`);
                        reject(fbError);
                      }
                    }
                  }).catch(err => {
                    console.error(`Error in frame capture process: ${err}`);
                    reject(err);
                  });
                  
                  resolve();
                } catch (movError) {
                  console.error(`Error processing MOV file: ${movError}`);
                  
                  // Create fallback thumbnails if everything else fails
                  try {
                    const videoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#3A57E8"/><circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/><text x="300" y="200" fill="#fff" text-anchor="middle" font-size="14">Video Thumbnail</text><polygon points="270,160 270,240 350,200" fill="#fff"/></svg>');
                    
                    // Make sure the thumbnail directory exists
                    const thumbDir = path.dirname(targetPath);
                    if (!fs.existsSync(thumbDir)) {
                      fs.mkdirSync(thumbDir, { recursive: true });
                    }
                    
                    // Create all emergency fallback versions
                    const jpgThumbPath = targetPath.replace('.mov', '.jpg');
                    const posterFilename = filename.replace('.mov', '.poster.jpg');
                    const posterPath = path.join(path.dirname(videoPath), posterFilename);
                    const nonPrefixedThumbPath = targetPath.replace('thumb-', '');
                    
                    fs.writeFileSync(jpgThumbPath, videoSvg);
                    fs.writeFileSync(targetPath, videoSvg);
                    fs.writeFileSync(posterPath, videoSvg);
                    fs.writeFileSync(nonPrefixedThumbPath, videoSvg);
                    
                    console.log(`Created emergency fallback thumbnails after all other methods failed`);
                    
                    // Upload fallbacks to Object Storage
                    if (this.objectStorage) {
                      const thumbnailBasename = path.basename(targetPath);
                      const jpgThumbBasename = path.basename(jpgThumbPath);
                      const posterBasename = path.basename(posterPath);
                      const nonPrefixedBasename = path.basename(nonPrefixedThumbPath);
                      
                      const sharedThumbKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
                      const sharedJpgThumbKey = `shared/uploads/thumbnails/${jpgThumbBasename}`;
                      const sharedPosterKey = `shared/uploads/thumbnails/${posterBasename}`;
                      const sharedNonPrefixedKey = `shared/uploads/thumbnails/${nonPrefixedBasename}`;
                      
                      this.objectStorage.uploadFromBytes(sharedThumbKey, videoSvg)
                        .catch(e => console.error(`Failed to upload emergency fallback:`, e));
                      
                      this.objectStorage.uploadFromBytes(sharedJpgThumbKey, videoSvg)
                        .catch(e => console.error(`Failed to upload emergency fallback:`, e));
                      
                      this.objectStorage.uploadFromBytes(sharedPosterKey, videoSvg)
                        .catch(e => console.error(`Failed to upload emergency fallback:`, e));
                      
                      this.objectStorage.uploadFromBytes(sharedNonPrefixedKey, videoSvg)
                        .catch(e => console.error(`Failed to upload emergency fallback:`, e));
                    }
                    
                    resolve();
                  } catch (fallbackErr) {
                    console.error(`Failed to create emergency fallbacks:`, fallbackErr);
                    reject(fallbackErr);
                  }
                }
              } else {
                // For non-MOV files, use ffmpeg to extract a frame
                const ffmpeg = require('fluent-ffmpeg');
                  
                console.log(`[${processId}] Starting ffmpeg process for ${normalizedVideoPath}`);
                
                const command = ffmpeg(normalizedVideoPath)
                  .on('start', (commandLine: string) => {
                    console.log(`[${processId}] Executing ffmpeg command: ${commandLine}`);
                  })
                  .on('end', () => {
                    console.log(`[${processId}] Successfully created video thumbnail at ${targetPath}`);
                    logger.info(`Created video thumbnail at ${targetPath}`);
                    
                    // Check if the thumbnail was actually created
                    if (!fs.existsSync(targetPath)) {
                      console.error(`[${processId}] Thumbnail file doesn't exist after ffmpeg completion: ${targetPath}`);
                      reject(new Error('Thumbnail file not created by ffmpeg'));
                      return;
                    }
                    
                    // Upload the thumbnail to Object Storage
                    if (this.objectStorage) {
                      // Capture the thumbnail into a buffer
                      fs.readFile(targetPath, (readErr, thumbnailBuffer) => {
                        if (readErr) {
                          console.error(`[${processId}] Error reading thumbnail for upload: ${readErr}`);
                          // We can still resolve since the local thumbnail was created
                          resolve();
                          return;
                        }
                        
                        const thumbnailBasename = path.basename(targetPath);
                        
                        // Store only in shared path to save space
                        const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
                        
                        console.log(`[${processId}] Uploading thumbnail to Object Storage with shared key: ${sharedKey}`);
                        
                        this.objectStorage!.uploadFromBytes(sharedKey, thumbnailBuffer)
                          .then(() => {
                            console.log(`[${processId}] Successfully uploaded video thumbnail to Object Storage`);
                            resolve();
                          })
                          .catch(objStoreError => {
                            console.error(`[${processId}] Failed to upload thumbnail to Object Storage:`, objStoreError);
                            // We can still resolve since the local thumbnail was created
                            resolve();
                          });
                      });
                    } else {
                      resolve();
                    }
                  })
                  .on('error', (err: Error, stdout: string, stderr: string) => {
                    console.error(`[${processId}] Error creating video thumbnail: ${err.message}`);
                    console.error(`[${processId}] ffmpeg stdout: ${stdout}`);
                    console.error(`[${processId}] ffmpeg stderr: ${stderr}`);
                    logger.error(`Error creating video thumbnail: ${err.message}`, { stderr });
                    
                    // Instead of failing completely, try to create a fallback thumbnail
                    console.log(`[${processId}] Creating fallback thumbnail`);
                    
                    // Create a default video thumbnail as SVG for failed conversions
                    const videoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#6366f1"/><circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/><circle cx="300" cy="200" r="120" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/><polygon points="290,180 290,220 320,200" fill="#fff"/></svg>');
                    
                    try {
                      fs.writeFileSync(targetPath, videoSvg);
                      console.log(`[${processId}] Created fallback thumbnail at ${targetPath}`);
                      
                      // Upload the fallback thumbnail to Object Storage
                      if (this.objectStorage) {
                        const thumbnailBasename = path.basename(targetPath);
                        
                        // Store only in shared path to save space
                        const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
                        
                        console.log(`[${processId}] Uploading fallback thumbnail to Object Storage with shared key: ${sharedKey}`);
                        
                        this.objectStorage.uploadFromBytes(sharedKey, videoSvg)
                          .then(() => {
                            console.log(`[${processId}] Successfully uploaded fallback thumbnail to Object Storage`);
                            resolve();
                          })
                          .catch(objStoreError => {
                            console.error(`[${processId}] Failed to upload fallback thumbnail to Object Storage:`, objStoreError);
                            // We can still resolve since the local thumbnail was created
                            resolve();
                          });
                      } else {
                        resolve();
                      }
                    } catch (writeError) {
                      console.error(`[${processId}] Error writing fallback thumbnail: ${writeError}`);
                      reject(writeError);
                    }
                  })
                  .screenshots({
                    count: 1,
                    folder: path.dirname(targetPath),
                    filename: path.basename(targetPath),
                    timemarks: ['1'],     // Take screenshot at 1 second
                    size: '600x?'         // Resize to 600px width, maintain aspect ratio
                  });
                
                // Create a timeout to prevent hanging
                const timeout = setTimeout(() => {
                  console.error(`[${processId}] Thumbnail generation timeout after 60s for ${normalizedVideoPath}`);
                  
                  // Try to create a fallback thumbnail
                  try {
                    // Create a default video thumbnail
                    const videoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#dc2626"/><circle cx="300" cy="200" r="80" stroke="#fff" stroke-width="8" fill="none"/><circle cx="300" cy="200" r="120" stroke="#fff" stroke-width="2" fill="rgba(255,255,255,0.2)"/><polygon points="290,180 290,220 320,200" fill="#fff"/></svg>');
                    fs.writeFileSync(targetPath, videoSvg);
                    console.log(`[${processId}] Created timeout fallback thumbnail at ${targetPath}`);
                    
                    // Upload the fallback thumbnail to Object Storage
                    if (this.objectStorage) {
                      const thumbnailBasename = path.basename(targetPath);
                      
                      // Store only in shared path to save space
                      const sharedKey = `shared/uploads/thumbnails/${thumbnailBasename}`;
                      
                      this.objectStorage.uploadFromBytes(sharedKey, videoSvg)
                        .then(() => {
                          console.log(`[${processId}] Successfully uploaded timeout fallback thumbnail to Object Storage`);
                        })
                        .catch(objStoreError => {
                          console.error(`[${processId}] Failed to upload timeout fallback thumbnail to Object Storage:`, objStoreError);
                        });
                    }
                    
                    resolve();
                  } catch (fallbackError) {
                    console.error(`[${processId}] Failed to create fallback thumbnail after timeout: ${fallbackError}`);
                    reject(fallbackError);
                  }
                }, 60000); // 60 second timeout
                
                // Clear the timeout when the process completes or errors
                command.on('end', () => clearTimeout(timeout));
                command.on('error', () => clearTimeout(timeout));
              }
            };
            
            // This function tries local fallbacks if Object Storage retrieval fails
            const tryLocalFallbacks = () => {
              // Try to find the video in alternative locations (for memory verse or miscellaneous videos)
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
                  continueWithThumbnailGeneration();
                } else {
                  const error = new Error(`Source video file not found: ${videoPath}`);
                  console.error(`Could not find video in any alternate locations`);
                  reject(error);
                }
              } else {
                const error = new Error(`Source video file not found: ${videoPath}`);
                reject(error);
              }
            };
            
            // We'll handle the rest of the method through our callback structure
            return;
          } else {
            // If no Object Storage, fall back to checking local files
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
  async getFileInfo(fileUrl: string): Promise<{ 
    url: string;
    thumbnailUrl: string | null;
    filename: string;
    mimeType: string | null;
    size: number;
    path: string;
    fromObjectStorage?: boolean;
  } | null> {
    try {
      if (!fileUrl) return null;

      // Extract filename from URL
      const filename = path.basename(fileUrl);
      
      // Handle special directories in the URL
      let basePathForFile = this.baseDir;
      
      // Check if this is a memory verse or miscellaneous video
      const isMemoryVerse = fileUrl.toLowerCase().includes('memory_verse') || filename.toLowerCase().includes('memory_verse');
      const isMiscellaneous = fileUrl.toLowerCase().includes('miscellaneous') || filename.toLowerCase().includes('miscellaneous');
      
      // Adjust base path for special file types
      if (isMemoryVerse) {
        basePathForFile = path.join(this.baseDir, 'memory_verse');
      } else if (isMiscellaneous) {
        basePathForFile = path.join(this.baseDir, 'miscellaneous');
      }
      
      // Create standard file path
      const filePath = path.join(basePathForFile, filename);
      
      // Generate a list of possible paths to check
      const pathsToCheck = [
        filePath,  // Base path (potentially adjusted for special directories)
        path.join(this.baseDir, filename),  // Standard uploads path
        path.join(process.cwd(), 'uploads', filename)  // Root-relative uploads path
      ];
      
      // Add memory verse specific paths
      if (isMemoryVerse) {
        pathsToCheck.push(
          path.join(this.baseDir, 'memory_verse', filename),
          path.join(process.cwd(), 'uploads', 'memory_verse', filename)
        );
      }
      
      // Add miscellaneous specific paths
      if (isMiscellaneous) {
        pathsToCheck.push(
          path.join(this.baseDir, 'miscellaneous', filename),
          path.join(process.cwd(), 'uploads', 'miscellaneous', filename)
        );
      }
      
      // Check if file exists in any of our possible locations
      let fileExists = false;
      let actualFilePath = filePath;
      
      for (const pathToCheck of pathsToCheck) {
        if (fs.existsSync(pathToCheck)) {
          fileExists = true;
          actualFilePath = pathToCheck;
          console.log(`Found file at path: ${actualFilePath}`);
          break;
        }
      }
      
      // Get possible object storage keys to check - ONLY using shared paths
      let objectStorageKeys = [
        fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl,  // Standard key
        // Always add shared path versions
        `shared/uploads/${filename}`
      ];
      
      // Add keys for special directories
      if (isMemoryVerse) {
        objectStorageKeys.push(
          `shared/uploads/memory_verse/${filename}`,
          `memory_verse/${filename}`
        );
      } else if (isMiscellaneous) {
        objectStorageKeys.push(
          `shared/uploads/miscellaneous/${filename}`,
          `miscellaneous/${filename}`
        );
      }
      
      let fileSize: number | undefined;
      let fromObjectStorage = false;
      
      // If file doesn't exist locally, check in object storage for any of our possible keys
      if (!fileExists && this.objectStorage) {
        console.log(`File not found locally, checking object storage with keys:`, objectStorageKeys);
        
        let objectExists = false;
        let foundKey = '';
        
        // Try each potential key
        for (const key of objectStorageKeys) {
          try {
            const exists = await this.objectStorage.exists(key);
            if (exists) {
              objectExists = true;
              foundKey = key;
              console.log(`File found in object storage with key: ${foundKey}`);
              break;
            }
          } catch (error) {
            console.log(`Error checking key ${key} in object storage:`, error);
          }
        }
        
        if (objectExists && foundKey) {
          // File exists in object storage
          fileExists = true;
          fromObjectStorage = true;
          
          // Try to download and cache the file locally for future access
          try {
            console.log(`Downloading file from object storage with key: ${foundKey}`);
            const result = await this.objectStorage.downloadAsBytes(foundKey);
            
            // Handle different response formats from Object Storage client
            let buffer: Buffer | null = null;
            
            // Parse the result based on its format
            if (Buffer.isBuffer(result)) {
              buffer = result;
              console.log(`Object Storage returned a Buffer directly (size: ${buffer.length} bytes)`);
            } 
            // Then check if result is an object with ok property (newer format)
            else if (result && typeof result === 'object' && 'ok' in result) {
              if (result.ok === true && result.value) {
                // Check if the value property is a Buffer
                if (Buffer.isBuffer(result.value)) {
                  buffer = result.value;
                  console.log(`Object Storage returned a Result object with Buffer value (size: ${buffer.length} bytes)`);
                } else if (Array.isArray(result.value) && Buffer.isBuffer(result.value[0])) {
                  buffer = result.value[0];
                  console.log(`Object Storage returned a Result object with Buffer array (size: ${buffer.length} bytes)`);
                } else {
                  console.error(`Object Storage result has non-Buffer value:`, typeof result.value);
                }
              } else {
                console.error(`Object Storage result indicates failure:`, result.error || 'Unknown error');
              }
            } else if (Array.isArray(result) && Buffer.isBuffer(result[0])) {
              buffer = result[0];
              console.log(`Downloaded ${buffer.length} bytes array from object storage`);
            } else {
              console.error(`Unknown Object Storage result format:`, typeof result);
              // Create an empty buffer as fallback for backward compatibility
              buffer = Buffer.from([]);
            }
            
            if (buffer) {
              // Ensure directory exists
              const dir = path.dirname(actualFilePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              
              if (buffer.length === 0) {
                console.error(`Downloaded empty buffer from object storage for key: ${foundKey}`);
              }
              
              // Cache the file locally
              fs.writeFileSync(actualFilePath, buffer);
              console.log(`Cached file from object storage to local path: ${actualFilePath}`);
              
              // Now we can get the stats locally
              if (fs.existsSync(actualFilePath)) {
                const stats = fs.statSync(actualFilePath);
                fileSize = stats.size;
                console.log(`File size after caching: ${fileSize} bytes`);
              } else {
                console.error(`Failed to cache file from object storage to ${actualFilePath}`);
              }
            }
          } catch (downloadError) {
            console.error(`Failed to download file from object storage: ${foundKey}`, downloadError);
            // We can still return the file info, but it won't be cached locally
            // Estimate a file size if we don't have it
            fileSize = 1024; // Default to 1KB
          }
        } else {
          console.log(`File not found in object storage with any key:`, objectStorageKeys);
        }
      }
      
      if (!fileExists) {
        return null;
      }
      
      // Get file stats if we haven't already
      let stats;
      if (fs.existsSync(actualFilePath)) {
        stats = fs.statSync(actualFilePath);
        fileSize = stats.size;
        console.log(`Got stats for file at ${actualFilePath}: size = ${fileSize} bytes`);
      } else if (!fileSize) {
        // We don't have the file locally and didn't get a size from object storage
        console.log(`File not found locally at ${actualFilePath} and no size available from object storage`);
        return null;
      }

      // Determine mime type based on extension (simplified)
      const ext = path.extname(filename).toLowerCase();
      let mimeType = null;

      if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.mp4') mimeType = 'video/mp4';
      else if (ext === '.webm') mimeType = 'video/webm';
      else if (ext === '.mov') mimeType = 'video/quicktime';

      // Check if thumbnail exists - try different naming patterns
      const standardThumbFilename = `thumb-${filename}`;
      const alternateThumbFilename = filename;  // Some systems don't use the thumb- prefix
      
      // List of possible thumbnail paths to check
      const thumbnailPathsToCheck = [
        path.join(this.thumbnailDir, standardThumbFilename),
        path.join(this.thumbnailDir, alternateThumbFilename)
      ];
      
      // Add special thumbnail locations for memory verse and miscellaneous videos
      if (isMemoryVerse || isMiscellaneous) {
        // For videos, try both jpg and png extensions
        const baseFilename = filename.substring(0, filename.lastIndexOf('.')) || filename;
        
        thumbnailPathsToCheck.push(
          path.join(this.thumbnailDir, `${baseFilename}.jpg`),
          path.join(this.thumbnailDir, `${baseFilename}.png`),
          path.join(this.thumbnailDir, `thumb-${baseFilename}.jpg`),
          path.join(this.thumbnailDir, `thumb-${baseFilename}.png`)
        );
        
        // Add special directory paths
        if (isMemoryVerse) {
          thumbnailPathsToCheck.push(
            path.join(this.thumbnailDir, 'memory_verse', filename),
            path.join(this.thumbnailDir, 'memory_verse', `thumb-${filename}`),
            path.join(process.cwd(), 'uploads', 'thumbnails', 'memory_verse', filename),
            path.join(process.cwd(), 'uploads', 'thumbnails', 'memory_verse', `thumb-${filename}`)
          );
        } else if (isMiscellaneous) {
          thumbnailPathsToCheck.push(
            path.join(this.thumbnailDir, 'miscellaneous', filename),
            path.join(this.thumbnailDir, 'miscellaneous', `thumb-${filename}`),
            path.join(process.cwd(), 'uploads', 'thumbnails', 'miscellaneous', filename),
            path.join(process.cwd(), 'uploads', 'thumbnails', 'miscellaneous', `thumb-${filename}`)
          );
        }
      }
      
      // Check if thumbnail exists in any of the paths
      let thumbnailUrl = null;
      let thumbnailPath = path.join(this.thumbnailDir, standardThumbFilename);
      
      for (const pathToCheck of thumbnailPathsToCheck) {
        if (fs.existsSync(pathToCheck)) {
          // Use the relative path structure for URL
          const relPath = pathToCheck.replace(process.cwd(), '').replace(/^\//, '');
          thumbnailUrl = `/${relPath}`;
          thumbnailPath = pathToCheck;
          console.log(`Found thumbnail at: ${pathToCheck}`);
          break;
        }
      }
      
      // If thumbnail doesn't exist locally, check in object storage
      if (!thumbnailUrl && this.objectStorage) {
        // Generate potential thumbnail keys to check in object storage - ONLY using shared paths
        const thumbnailKeys = [
          `shared/uploads/thumbnails/${standardThumbFilename}`,
          `shared/uploads/thumbnails/${alternateThumbFilename}`
        ];
        
        // Add keys for special directories
        if (isMemoryVerse) {
          thumbnailKeys.push(
            `shared/uploads/thumbnails/memory_verse/${standardThumbFilename}`,
            `shared/uploads/thumbnails/memory_verse/${alternateThumbFilename}`,
            `memory_verse/thumbnails/${standardThumbFilename}`
          );
        } else if (isMiscellaneous) {
          thumbnailKeys.push(
            `shared/uploads/thumbnails/miscellaneous/${standardThumbFilename}`,
            `shared/uploads/thumbnails/miscellaneous/${alternateThumbFilename}`,
            `miscellaneous/thumbnails/${standardThumbFilename}`
          );
        }
        
        // Try each key in object storage
        let objectExists = false;
        let foundKey = '';
        let foundUrl = '';
        
        for (const key of thumbnailKeys) {
          try {
            // Get the exists result and properly handle both result formats
            const existsResult = await this.objectStorage.exists(key);
            let keyExists = false;
            
            // Handle different result formats from Object Storage API
            if (typeof existsResult === 'object' && existsResult !== null && 'ok' in existsResult) {
              // Result object format: { ok: true, value: true/false }
              if (existsResult.ok === true) {
                keyExists = Boolean(existsResult.value);
                console.log(`Object Storage exists check for ${key} returned ok:true, value:${existsResult.value}`);
              } else {
                console.log(`Object Storage exists returned error for ${key}:`, existsResult.error || 'Unknown error');
              }
            } else {
              // Direct boolean format
              keyExists = Boolean(existsResult);
              console.log(`Object Storage exists check for ${key} returned direct boolean: ${keyExists}`);
            }
            
            if (keyExists) {
              objectExists = true;
              foundKey = key;
              
              // Determine URL based on key structure - always use shared paths
              if (key.includes('memory_verse')) {
                foundUrl = `/shared/uploads/thumbnails/memory_verse/${standardThumbFilename}`;
              } else if (key.includes('miscellaneous')) {
                foundUrl = `/shared/uploads/thumbnails/miscellaneous/${standardThumbFilename}`;
              } else {
                foundUrl = `/shared/uploads/thumbnails/${standardThumbFilename}`;
              }
              
              console.log(`Found thumbnail in object storage with key: ${foundKey}`);
              break;
            }
          } catch (error) {
            console.log(`Error checking thumbnail key ${key} in object storage:`, error);
          }
        }
        
        if (objectExists && foundKey) {
          thumbnailUrl = foundUrl;
          
          // Set the correct local path based on the foundUrl
          const localThumbPath = path.join(process.cwd(), foundUrl.substring(1));
          thumbnailPath = localThumbPath;
          
          // Try to download and cache the thumbnail
          try {
            console.log(`Downloading thumbnail from object storage with key: ${foundKey}`);
            const result = await this.objectStorage.downloadAsBytes(foundKey);
            
            // Handle different response formats from Object Storage client
            let buffer: Buffer | null = null;
            
            // Parse the result based on its format
            if (Buffer.isBuffer(result)) {
              buffer = result;
              console.log(`Object Storage returned a Buffer directly for thumbnail (size: ${buffer.length} bytes)`);
            } 
            // Then check if result is an object with ok property (newer format)
            else if (result && typeof result === 'object' && 'ok' in result) {
              if (result.ok === true && result.value) {
                // Check if the value property is a Buffer
                if (Buffer.isBuffer(result.value)) {
                  buffer = result.value;
                  console.log(`Object Storage returned a Result object with Buffer value for thumbnail (size: ${buffer.length} bytes)`);
                } else if (Array.isArray(result.value) && Buffer.isBuffer(result.value[0])) {
                  buffer = result.value[0];
                  console.log(`Object Storage returned a Result object with Buffer array for thumbnail (size: ${buffer.length} bytes)`);
                } else {
                  console.error(`Object Storage result has non-Buffer value for thumbnail:`, typeof result.value);
                }
              } else {
                console.error(`Object Storage result indicates failure for thumbnail:`, result.error || 'Unknown error');
              }
            } else if (Array.isArray(result) && Buffer.isBuffer(result[0])) {
              buffer = result[0];
              console.log(`Downloaded ${buffer.length} bytes array from object storage for thumbnail`);
            } else {
              console.error(`Unknown Object Storage result format for thumbnail:`, typeof result);
              // Create an empty buffer as fallback for backward compatibility
              buffer = Buffer.from([]);
            }
            
            if (buffer) {
              // Ensure thumbnail directory exists
              const thumbDir = path.dirname(thumbnailPath);
              if (!fs.existsSync(thumbDir)) {
                fs.mkdirSync(thumbDir, { recursive: true });
              }
              
              if (buffer.length === 0) {
                console.error(`Downloaded empty buffer for thumbnail from object storage: ${foundKey}`);
              }
              
              // Cache the thumbnail locally
              fs.writeFileSync(thumbnailPath, buffer);
              console.log(`Cached thumbnail from object storage to local path: ${thumbnailPath}`);
            }
          } catch (downloadError) {
            console.error(`Failed to download thumbnail from object storage: ${foundKey}`, downloadError);
            // We'll still use the URL, but it won't be cached locally
          }
        } else {
          console.log(`Thumbnail not found in object storage with any key`);
        }
      }

      // Construct a proper URL that doesn't nest API paths
      // This fixes the issue with nested parameters in URLs
      let finalUrl = fileUrl;
      
      // If the file was found in Object Storage, use a clean direct-download URL
      if (fromObjectStorage) {
        // Get clean path for direct-download
        const cleanFilePath = `shared/uploads/${filename}`;
        // Special handling for memory verse and miscellaneous videos
        if (isMemoryVerse) {
          finalUrl = `/api/object-storage/direct-download?fileUrl=shared/uploads/memory_verse/${filename}`;
        } else if (isMiscellaneous) {
          finalUrl = `/api/object-storage/direct-download?fileUrl=shared/uploads/miscellaneous/${filename}`;
        } else {
          finalUrl = `/api/object-storage/direct-download?fileUrl=${cleanFilePath}`;
        }
        console.log(`Fixed URL construction: ${fileUrl} -> ${finalUrl}`);
      }
      
      return {
        url: finalUrl,
        thumbnailUrl,
        filename,
        mimeType,
        size: fileSize || (stats ? stats.size : 1024), // Use fileSize if available, otherwise use stats.size or fallback to 1024
        path: actualFilePath, // Use the actual file path that was found
        fromObjectStorage: fromObjectStorage
      };
    } catch (error) {
      logger.error('Error getting file info:', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
}

// Export singleton instance
export const spartaStorage = new SpartaObjectStorage();