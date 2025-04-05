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
    baseDir: string = path.join(process.cwd(), '..', 'uploads'),
    thumbnailDir: string = path.join(process.cwd(), '..', 'uploads', 'thumbnails'),
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'application/octet-stream'] // Added more video types and octet-stream
  ) {
    this.baseDir = baseDir;
    this.thumbnailDir = thumbnailDir;
    this.allowedTypes = allowedTypes;

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Make sure required directories exist
   */
  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
        logger.info(`Created base upload directory: ${this.baseDir}`);
      }

      if (!fs.existsSync(this.thumbnailDir)) {
        fs.mkdirSync(this.thumbnailDir, { recursive: true });
        logger.info(`Created thumbnail directory: ${this.thumbnailDir}`);
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
      
      // Force isVideo true if filename includes memory_verse (helps with type detection)
      const isMemoryVerse = originalFilename.toLowerCase().includes('memory_verse');
      if (isMemoryVerse) {
        isVideo = true;
        console.log("Detected memory verse video by filename:", originalFilename);
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
      const filePath = path.join(this.baseDir, safeFilename);
      console.log("Generated safe filename and path", { 
        safeFilename, 
        filePath,
        baseDir: this.baseDir 
      });

      // Convert string path to buffer if needed
      let fileBuffer: Buffer;
      if (typeof fileData === 'string') {
        // If fileData is a path to a local file
        console.log("Reading file from path:", fileData);
        try {
          const stats = fs.statSync(fileData);
          console.log("File stats:", { size: stats.size, isFile: stats.isFile() });
        } catch (statError) {
          console.error("Error getting file stats:", statError);
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
      const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);
      
      console.log(`Preparing to create thumbnail: ${thumbnailFilename}`);

      try {
        // Ensure thumbnail directory exists
        if (!fs.existsSync(this.thumbnailDir)) {
          console.log(`Creating thumbnails directory: ${this.thumbnailDir}`);
          fs.mkdirSync(this.thumbnailDir, { recursive: true });
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
          
          // For memory verse videos, ensure we preserve the file exactly as is
          if (originalFilename.toLowerCase().includes('memory_verse')) {
            console.log("Memory verse video detected, ensuring direct file copy");
            // Just ensure the file exists in the correct uploads folder
            const uploadsFilePath = path.join(this.baseDir, safeFilename);
            if (filePath !== uploadsFilePath && fs.existsSync(filePath)) {
              try {
                fs.copyFileSync(filePath, uploadsFilePath);
                console.log(`Copied memory verse video to proper location: ${uploadsFilePath}`);
              } catch (copyError) {
                console.error("Error copying memory verse video:", copyError);
              }
            }
          }
          
          try {
            await this.createVideoThumbnail(filePath, thumbnailPath);
            thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
            console.log(`Video thumbnail created at ${thumbnailPath}`);
            logger.info(`Created video thumbnail for ${safeFilename}`);
            
            // Double-check the thumbnail was created
            if (fs.existsSync(thumbnailPath)) {
              console.log(`Verified thumbnail exists at ${thumbnailPath}`);
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

      return {
        url: `/uploads/${safeFilename}`,
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
          
          reject(error);
          return;
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

      // Extract filename from URL
      const filename = path.basename(fileUrl);
      const filePath = path.join(this.baseDir, filename);

      // Check if file exists before deleting
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Deleted file ${filename}`);

        // Also try to delete thumbnail if it exists
        const thumbnailPath = path.join(this.thumbnailDir, `thumb-${filename}`);
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          logger.info(`Deleted thumbnail for ${filename}`);
        }
      } else {
        logger.warn(`File not found for deletion: ${filePath}`);
      }
    } catch (error) {
      logger.error('Error deleting file:', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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