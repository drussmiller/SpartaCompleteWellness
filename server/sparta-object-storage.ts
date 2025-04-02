import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

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
    allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
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
   * @returns Promise with the stored file information
   */
  async storeFile(
    fileData: Buffer | string,
    originalFilename: string,
    mimeType: string
  ): Promise<{ 
    url: string;
    thumbnailUrl: string | null;
    filename: string;
    mimeType: string;
    size: number;
    path: string;
  }> {
    try {
      // Validate file type
      if (!this.allowedTypes.includes(mimeType)) {
        throw new Error(`File type ${mimeType} not allowed`);
      }
      
      // Generate a unique filename
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const fileExt = path.extname(originalFilename);
      const safeFilename = `${timestamp}-${uniqueId}${fileExt}`;
      const filePath = path.join(this.baseDir, safeFilename);
      
      // Convert string path to buffer if needed
      let fileBuffer: Buffer;
      if (typeof fileData === 'string') {
        fileBuffer = fs.readFileSync(fileData);
      } else {
        fileBuffer = fileData;
      }
      
      // Write the file
      fs.writeFileSync(filePath, fileBuffer);
      
      // Get file size
      const stats = fs.statSync(filePath);
      
      let thumbnailUrl = null;
      
      // Create thumbnail if it's an image
      if (mimeType.startsWith('image/')) {
        const thumbnailFilename = `thumb-${safeFilename}`;
        const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);
        
        await this.createThumbnail(filePath, thumbnailPath);
        thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
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