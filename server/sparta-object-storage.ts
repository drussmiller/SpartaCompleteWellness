import * as fs from 'fs';
import * as path from 'path';
import { Client } from '@replit/object-storage';
import { logger } from './logger';

/**
 * SpartaObjectStorage provides a unified interface for handling file objects
 * such as images and other media files with proper error handling and logging.
 * It supports both filesystem storage and Replit Object Storage for cross-environment compatibility.
 */
export class SpartaObjectStorage {
  private baseDir: string;
  private thumbnailDir: string;
  private allowedTypes: string[];
  private objectStorage: Client | null = null;
  private isProductionEnv: boolean = process.env.NODE_ENV === 'production';

  /**
   * Creates a new SpartaObjectStorage instance
   * @param baseDir Base directory to store original uploads
   * @param thumbnailDir Directory to store thumbnails
   * @param allowedTypes Array of allowed mime types
   */
  constructor(
    baseDir: string = path.join(process.cwd(), 'uploads'),
    thumbnailDir: string = path.join(process.cwd(), 'uploads', 'thumbnails'),
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
  ) {
    this.baseDir = baseDir;
    this.thumbnailDir = thumbnailDir;
    this.allowedTypes = allowedTypes;

    // Initialize Object Storage if available - client initialization only
    try {
      this.objectStorage = new Client({
        bucketId: 'replit-objstore-4b249457-61b0-4fe4-bc15-0408c0209445'
      });
      console.log('Object Storage client initialized with bucket ID - functionality will be tested on first use');
    } catch (error) {
      console.log('Object Storage client initialization failed, using local filesystem only:', (error as Error).message);
      this.objectStorage = null;
    }

    this.ensureDirectories();
  }

  /**
   * Make sure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.thumbnailDir)) {
      fs.mkdirSync(this.thumbnailDir, { recursive: true });
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
    mimeType: string
  ): Promise<string> {
    if (!this.allowedTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} not allowed`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const filePath = path.join(this.baseDir, uniqueFilename);

    // Write file to local filesystem
    fs.writeFileSync(filePath, buffer);

    // Try to upload to Object Storage if available
    if (this.objectStorage) {
      try {
        const key = `shared/uploads/${uniqueFilename}`;
        await this.objectStorage.uploadFromBytes(key, buffer);
        console.log(`Successfully uploaded ${uniqueFilename} to Object Storage with key: ${key}`);
        // Return the raw storage key
        return key;
      } catch (error) {
        console.error(`Object Storage upload failed for ${uniqueFilename}, using local storage:`, error.message);
        // Fall through to local storage
      }
    }

    return `/uploads/${uniqueFilename}`;
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
    filename: string;
    url: string;
    thumbnailUrl?: string;
  }> {
    if (!this.allowedTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} not allowed`);
    }

    let fileBuffer: Buffer;
    if (Buffer.isBuffer(fileData)) {
      fileBuffer = fileData;
    } else {
      fileBuffer = fs.readFileSync(fileData);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, fileExt);
    const uniqueFilename = `${timestamp}-${baseName}${fileExt}`;
    const filePath = path.join(this.baseDir, uniqueFilename);

    // Ensure upload directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    // Write file to local filesystem (temporary for thumbnail generation)
    fs.writeFileSync(filePath, fileBuffer);

    // Try to upload to Object Storage if available
    if (this.objectStorage) {
      try {
        const key = `shared/uploads/${uniqueFilename}`;
        const uploadResult = await this.objectStorage.uploadFromBytes(key, fileBuffer);
        
        // Check if upload actually succeeded
        if (uploadResult && typeof uploadResult === 'object' && 'ok' in uploadResult) {
          if (uploadResult.ok === true) {
            console.log(`Successfully uploaded ${uniqueFilename} to Object Storage with key: ${key}`);
          } else {
            throw new Error(`Object Storage upload failed: ${uploadResult.error || 'Unknown error'}`);
          }
        } else {
          console.log(`Upload completed for ${uniqueFilename} (legacy API format)`);
        }
        
        const result = {
          filename: uniqueFilename,
          url: key,
        } as any;
        
        // Create thumbnail only for videos (images are displayed at original size)
        if (isVideo) {
          try {
            const thumbnailFilename = `${uniqueFilename.replace(fileExt, '.jpg')}`;
            const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

            await this.createVideoThumbnail(filePath, thumbnailPath);

            // Upload thumbnail to Object Storage
            if (fs.existsSync(thumbnailPath)) {
              const thumbnailBuffer = fs.readFileSync(thumbnailPath);
              const thumbnailKey = `shared/uploads/${thumbnailFilename}`;
              await this.objectStorage.uploadFromBytes(thumbnailKey, thumbnailBuffer);
              console.log(`Successfully uploaded thumbnail ${thumbnailFilename} to Object Storage at ${thumbnailKey}`);
              result.thumbnailUrl = thumbnailKey;
              
              // Clean up local thumbnail file
              fs.unlinkSync(thumbnailPath);
            }
          } catch (error) {
            console.error('Error creating/uploading thumbnail:', error);
            logger.error('Error creating/uploading thumbnail:', error instanceof Error ? error : new Error(String(error)));
          }
        }
        
        // Clean up local video file after successful upload
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up local file: ${filePath}`);
        }
        
        return result;
      } catch (error) {
        console.error(`Object Storage upload failed for ${uniqueFilename}, using local storage:`, error.message);
        // Fall through to local storage
      }
    }

    const result = {
      filename: uniqueFilename,
      url: `/uploads/${uniqueFilename}`,
    } as any;

    // Create thumbnail only for videos (images are displayed at original size)
    if (isVideo) {
      try {
        const thumbnailFilename = `thumb-${uniqueFilename.replace(fileExt, '.jpg')}`;
        const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

        await this.createVideoThumbnail(filePath, thumbnailPath);

        // Upload thumbnail to Object Storage if available
        if (this.objectStorage && fs.existsSync(thumbnailPath)) {
          try {
            const thumbnailBuffer = fs.readFileSync(thumbnailPath);
            const thumbnailKey = `shared/uploads/thumbnails/${thumbnailFilename}`;
            await this.objectStorage.uploadFromBytes(thumbnailKey, thumbnailBuffer);
            console.log(`Successfully uploaded thumbnail ${thumbnailFilename} to Object Storage`);
          } catch (error) {
            console.error(`Failed to upload thumbnail ${thumbnailFilename} to Object Storage:`, error);
          }
        }

        result.thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
      } catch (error) {
        console.error('Error creating thumbnail:', error);
        logger.error('Error creating thumbnail:', error instanceof Error ? error : new Error(String(error)));
      }
    }

    return result;
  }

  /**
   * Creates a thumbnail version of an image
   * @param sourcePath Path to source image
   * @param targetPath Path to save thumbnail
   * @returns Promise that resolves when thumbnail is created
   */
  private async createThumbnail(sourcePath: string, targetPath: string): Promise<void> {
    const sharp = (await import('sharp')).default;
    
    await sharp(sourcePath)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toFile(targetPath);
    
    console.log(`Created thumbnail: ${targetPath}`);
  }

  /**
   * Creates a thumbnail from a video file
   * @param videoPath Path to source video
   * @param targetPath Path to save thumbnail
   * @returns Promise that resolves when thumbnail is created
   */
  private async createVideoThumbnail(videoPath: string, targetPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const ffmpeg = (await import('fluent-ffmpeg')).default;
      
      // Create a random ID for this process
      const processId = Math.random().toString(36).substring(2, 8);
      
      console.log(`[${processId}] Creating video thumbnail: ${videoPath} -> ${targetPath}`);
      
      // Make sure the thumbnails directory exists
      const thumbnailDir = path.dirname(targetPath);
      if (!fs.existsSync(thumbnailDir)) {
        console.log(`Creating thumbnails directory: ${thumbnailDir}`);
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }
      
      // Check if source video exists
      if (!fs.existsSync(videoPath)) {
        reject(new Error(`Source video file not found: ${videoPath}`));
        return;
      }
      
      const command = ffmpeg(videoPath)
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
          
          resolve();
        })
        .on('error', (error: any, stdout: string, stderr: string) => {
          console.error(`[${processId}] Error creating video thumbnail: ${error.message}`);
          console.error(`[${processId}] ffmpeg stdout: ${stdout}`);
          console.error(`[${processId}] ffmpeg stderr: ${stderr}`);
          logger.error(`Error creating video thumbnail: ${error.message}`, { stderr });
          
          reject(new Error(`Failed to generate video thumbnail: ${error.message}`));
        })
        .seekInput(1)           // Seek to 1 second
        .frames(1)              // Extract 1 frame
        .outputOptions([
          '-vf', 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360'  // Scale and crop to center
        ])
        .output(targetPath)
        .run();
      
      // Create a timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error(`[${processId}] Thumbnail generation timeout after 60s for ${videoPath}`);
        reject(new Error(`Failed to generate video thumbnail: Timeout after 60s`));
      }, 60000); // 60 second timeout
      
      // Clear the timeout when the process completes or errors
      command.on('end', () => clearTimeout(timeout));
      command.on('error', () => clearTimeout(timeout));
    });
  }

  /**
   * Deletes a file by its URL
   * @param fileUrl URL of the file to delete (e.g., /uploads/filename.jpg)
   * @returns Promise that resolves when file is deleted
   */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl) {
      logger.warn('Attempted to delete null file URL');
      return;
    }

    console.log(`[DELETE] Attempting to delete file: ${fileUrl}`);

    // Handle both full paths and filenames
    // If fileUrl already contains 'shared/uploads/', use it as-is
    // Otherwise, extract filename and build the path
    let objectStorageKey = fileUrl;
    if (!fileUrl.startsWith('shared/uploads/')) {
      const filename = path.basename(fileUrl);
      objectStorageKey = `shared/uploads/${filename}`;
    }

    console.log(`[DELETE] Object Storage key: ${objectStorageKey}`);

    // Extract just the filename for local filesystem
    const filename = path.basename(objectStorageKey);
    const filePath = path.join(this.baseDir, filename);

    // Delete from local filesystem
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[DELETE] Deleted local file: ${filePath}`);
    } else {
      console.log(`[DELETE] Local file not found: ${filePath}`);
    }

    // Delete thumbnail if it exists (old naming convention)
    const thumbnailFilename = `thumb-${filename.replace(/\.[^/.]+$/, '.jpg')}`;
    const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
      console.log(`[DELETE] Deleted old-style thumbnail: ${thumbnailPath}`);
    }

    // Delete from Object Storage
    if (this.objectStorage) {
      try {
        await this.objectStorage.delete(objectStorageKey);
        console.log(`[DELETE] Successfully deleted from Object Storage: ${objectStorageKey}`);
      } catch (error) {
        console.error(`[DELETE] Error deleting from Object Storage (${objectStorageKey}):`, error);
        throw error; // Re-throw to let caller know deletion failed
      }
    } else {
      console.warn(`[DELETE] Object Storage not available, cannot delete: ${objectStorageKey}`);
    }
  }

  /**
   * Get file information by URL
   * @param fileUrl URL of the file
   * @returns File information or null if not found
   */
  async getFileInfo(fileUrl: string): Promise<{ path: string; exists: boolean; size?: number } | null> {
    if (!fileUrl) {
      return null;
    }

    const filename = path.basename(fileUrl);
    const filePath = path.join(this.baseDir, filename);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        exists: true,
        size: stats.size
      };
    }

    return {
      path: filePath,
      exists: false
    };
  }
}

export const spartaStorage = new SpartaObjectStorage();