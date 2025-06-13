import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createMovThumbnail } from './mov-frame-extractor-new.js';

/**
 * Final Object Storage implementation - Object Storage ONLY
 * No fallback to local filesystem - all files must be in Object Storage
 */
export class SpartaObjectStorageFinal {
  private objectStorage: Client;
  private allowedTypes: string[];
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(
    allowedTypes: string[] = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mov', 'video/avi', 'video/quicktime'
    ]
  ) {
    this.allowedTypes = allowedTypes;

    // Initialize Object Storage client (default config that was working)
    this.objectStorage = new Client();
    console.log('Object Storage Final client initialized - OBJECT STORAGE ONLY mode');
  }

  /**
   * Retry wrapper for Object Storage operations
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();

        // Check if result has the error format we've seen
        if (result && typeof result === 'object' && 'ok' in result) {
          const typedResult = result as { ok: boolean; error?: any; errorExtras?: any };
          if (typedResult.ok === false) {
            throw new Error(`Object Storage operation failed: ${typedResult.error?.message || 'Unknown error'}`);
          }
          // If ok is true or undefined, assume success and return the result
          return result;
        }

        // For operations that don't return the ok/error format, return as-is
        return result;

      } catch (error) {
        lastError = error;
        console.log(`${operationName} attempt ${attempt}/${this.maxRetries} failed:`, (error as Error).message);

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    throw new Error(`${operationName} failed after ${this.maxRetries} attempts: ${(lastError as Error).message}`);
  }

  /**
   * Upload file to Object Storage with retries
   */
  private async uploadToObjectStorage(key: string, buffer: Buffer): Promise<void> {
    await this.retryOperation(
      () => this.objectStorage.uploadFromBytes(key, buffer),
      `Upload ${key}`
    );
    console.log(`Successfully uploaded ${key} to Object Storage`);
  }

  /**
   * Store file in Object Storage ONLY
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

    // Upload main file to Object Storage
    const mainKey = `shared/uploads/${uniqueFilename}`;
    await this.uploadToObjectStorage(mainKey, fileBuffer);

    const result = {
      filename: uniqueFilename,
      url: `/api/object-storage/direct-download?storageKey=${mainKey}`,
    } as any;

    // Create and upload thumbnail if needed
    if (mimeType.startsWith('image/') || isVideo) {
      try {
        let thumbnailBuffer: Buffer;
        // Create thumbnail filename to match the video filename
        let thumbnailFilename: string;
        
        if (isVideo) {
          // For videos, use the exact same filename as the video but with .jpg extension
          thumbnailFilename = uniqueFilename.replace(/\.[^.]+$/, '.jpg');
        } else {
          // For images, use thumb- prefix with unique filename
          thumbnailFilename = `thumb-${uniqueFilename.replace(/\.[^.]+$/, '.jpg')}`;
        }

        const thumbnailKey = `shared/uploads/thumbnails/${thumbnailFilename}`;

        if (isVideo) {
          // Create temporary file for video processing
          const tempVideoPath = `/tmp/${uniqueFilename}`;

          fs.writeFileSync(tempVideoPath, fileBuffer);
          
          // Call createMovThumbnail which will create a thumbnail with matching filename
          const createdThumbnailFilename = await createMovThumbnail(tempVideoPath);

          if (createdThumbnailFilename) {
            // The thumbnail should already be uploaded to Object Storage by createMovThumbnail
            console.log(`Video thumbnail created successfully: ${createdThumbnailFilename}`);
            
            // Clean up temp video file
            fs.unlinkSync(tempVideoPath);
            
            // Set thumbnailBuffer to indicate success (we don't need the actual buffer since it's already uploaded)
            thumbnailBuffer = Buffer.from('thumbnail_created');
          } else {
            // Clean up temp video file
            fs.unlinkSync(tempVideoPath);
            throw new Error('Video thumbnail creation failed');
          }
        } else {
          // Create image thumbnail
          thumbnailBuffer = await sharp(fileBuffer)
            .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        }

        // Upload thumbnail to Object Storage
        await this.uploadToObjectStorage(thumbnailKey, thumbnailBuffer);

        result.thumbnailUrl = `/api/object-storage/direct-download?storageKey=${thumbnailKey}`;
        console.log(`Created and uploaded thumbnail: ${thumbnailKey}`);

      } catch (error) {
        console.error(`Failed to create thumbnail for ${uniqueFilename}:`, (error as Error).message);
        // Don't fail the upload if thumbnail creation fails
        result.thumbnailUrl = result.url; // Use main file as fallback
      }
    }

    return result;
  }

  /**
   * Delete file from Object Storage
   */
  async deleteFile(storageKey: string): Promise<void> {
    await this.retryOperation(
      () => this.objectStorage.delete(storageKey),
      `Delete ${storageKey}`
    );
    console.log(`Deleted from Object Storage: ${storageKey}`);
  }

  /**
   * Check if file exists in Object Storage
   */
  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const result = await this.retryOperation(
        () => this.objectStorage.exists(storageKey),
        `Check exists ${storageKey}`
      );
      return Boolean(result);
    } catch (error) {
      console.log(`File existence check failed for ${storageKey}:`, (error as Error).message);
      return false;
    }
  }

  /**
   * Download file from Object Storage
   */
  async downloadFile(storageKey: string): Promise<Buffer> {
    const result = await this.retryOperation(
      () => this.objectStorage.downloadAsBytes(storageKey),
      `Download ${storageKey}`
    );

    // Handle the result format from Object Storage API
    if (result && typeof result === 'object' && 'ok' in result) {
      const typedResult = result as { ok: boolean; data?: Buffer; error?: any };
      if (typedResult.ok && typedResult.data) {
        return typedResult.data;
      }
      throw new Error(`Download failed: ${typedResult.error?.message || 'Unknown error'}`);
    }

    // Assume it's a Buffer if not in the ok/error format
    return result as Buffer;
  }

  /**
   * List files in Object Storage
   */
  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const options = prefix ? { prefix } : undefined;
      const result = await this.retryOperation(
        () => this.objectStorage.list(options),
        `List files ${prefix || 'all'}`
      );

      // Handle different possible return formats
      if (Array.isArray(result)) {
        return result;
      } else if (result && typeof result === 'object' && 'objects' in result) {
        return (result as any).objects || [];
      } else {
        return [];
      }
    } catch (error) {
      console.error(`Failed to list files:`, (error as Error).message);
      return [];
    }
  }
}

// Export singleton instance
export const spartaObjectStorage = new SpartaObjectStorageFinal();