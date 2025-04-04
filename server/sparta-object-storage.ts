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
    baseDir: string = path.join(process.cwd(), 'uploads'),
    thumbnailDir: string = path.join(process.cwd(), 'uploads', 'thumbnails'),
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'] // Added video types
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
      
      // Validate file type
      if (!this.allowedTypes.includes(mimeType)) {
        logger.error(`File type ${mimeType} not allowed`);
        console.error(`File type ${mimeType} not allowed`);
        throw new Error(`File type ${mimeType} not allowed`);
      }

      // Generate a unique filename
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const fileExt = path.extname(originalFilename);
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

      try {
        if (mimeType.startsWith('image/')) {
          // Process image thumbnail
          await this.createThumbnail(filePath, thumbnailPath);
          thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
          logger.info(`Created image thumbnail for ${safeFilename}`);
        } else if (mimeType.startsWith('video/') || isVideo) {
          // Process video thumbnail
          await this.createVideoThumbnail(filePath, thumbnailPath);
          thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
          logger.info(`Created video thumbnail for ${safeFilename}`);
        }
      } catch (thumbnailError) {
        logger.error(`Error creating thumbnail for ${safeFilename}:`, thumbnailError);
        // Continue without thumbnail if there's an error
        thumbnailUrl = null;
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
      // Create a thumbnail that's max 600px wide but maintains aspect ratio
      await sharp(sourcePath)
        .resize({
          width: 600,
          height: 600,
          fit: 'inside',
          withoutEnlargement: true
        })
        .toFile(targetPath);

      logger.info(`Created thumbnail at ${targetPath}`);
    } catch (error) {
      logger.error('Error creating thumbnail:', error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to create thumbnail');
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
        ffmpeg(videoPath)
          .on('error', (err: Error | undefined) => {
            const errorMessage = err ? err.message : 'Unknown error';
            logger.error(`Error generating video thumbnail: ${errorMessage}`);
            reject(new Error(`Failed to generate video thumbnail: ${errorMessage}`));
          })
          .on('end', () => {
            logger.info(`Created video thumbnail at ${targetPath}`);
            resolve();
          })
          .screenshots({
            timestamps: ['00:00:01.000'], // Take screenshot at 1 second
            filename: path.basename(targetPath),
            folder: path.dirname(targetPath),
            size: '600x?', // Width 600px, height auto-calculated to maintain aspect ratio
          });
      } catch (error) {
        logger.error('Error creating video thumbnail:', error instanceof Error ? error : new Error(String(error)));
        reject(new Error('Failed to create video thumbnail'));
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