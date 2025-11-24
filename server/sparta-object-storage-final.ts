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
            // Better error message handling for different error formats
            let errorMessage = 'Unknown error';
            if (typedResult.error) {
              if (typeof typedResult.error === 'string') {
                errorMessage = typedResult.error;
              } else if (typedResult.error.message) {
                errorMessage = typedResult.error.message;
              } else if (typedResult.error.code) {
                errorMessage = `Error code: ${typedResult.error.code}`;
              } else {
                errorMessage = JSON.stringify(typedResult.error);
              }
            }
            throw new Error(`Object Storage operation failed: ${errorMessage}`);
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
  async uploadToObjectStorage(key: string, buffer: Buffer): Promise<void> {
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
    } else if (typeof fileData === 'string') {
      fileBuffer = fs.readFileSync(fileData);
    } else {
      throw new Error('Invalid file data: must be Buffer or file path string');
    }

    // Generate unique filename
    const timestamp = Date.now();
    let fileExt = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, fileExt);
    let uniqueFilename = `${timestamp}-${baseName}${fileExt}`;
    let finalBuffer = fileBuffer;

    // Convert ALL videos to Edge-compatible MP4 with faststart
    if (isVideo) {
      const { convertToMp4WithFaststart } = await import('./video-converter');
      
      console.log(`[Video Upload] Processing video, converting to H.264/AAC MP4 with faststart`);
      
      // Use distinct filenames to avoid ffmpeg input/output collision
      const tempOriginalPath = `/tmp/${timestamp}-${baseName}-source${fileExt}`;
      const mp4Filename = `${timestamp}-${baseName}.mp4`;
      const tempMp4Path = `/tmp/${mp4Filename}`;
      
      fs.writeFileSync(tempOriginalPath, fileBuffer);

      try {
        // Always convert to .mp4 with faststart (and H.264 if needed)
        await convertToMp4WithFaststart(tempOriginalPath, tempMp4Path);
        
        // Read converted file
        finalBuffer = fs.readFileSync(tempMp4Path);
        uniqueFilename = mp4Filename; // Use .mp4 extension
        
        // Clean up temp files
        fs.unlinkSync(tempMp4Path);
        
        console.log(`[Video Upload] Conversion complete: ${uniqueFilename}`);
        
        // Clean up original temp file
        fs.unlinkSync(tempOriginalPath);
        
      } catch (error) {
        // Clean up on error
        if (fs.existsSync(tempOriginalPath)) {
          fs.unlinkSync(tempOriginalPath);
        }
        throw error;
      }
    }

    // Check if large video needs HLS conversion
    const fileSize = finalBuffer.length;
    let isHLS = false;
    
    if (isVideo) {
      const { HLSConverter } = await import('./hls-converter');
      
      if (HLSConverter.shouldConvertToHLS(fileSize)) {
        console.log(`[Video Upload] Large video detected (${(fileSize / 1024 / 1024).toFixed(2)} MB), converting to HLS`);
        
        // Write converted MP4 to temp file for HLS conversion
        const tempVideoPath = `/tmp/${uniqueFilename}`;
        fs.writeFileSync(tempVideoPath, finalBuffer);
        
        try {
          const { hlsConverter } = await import('./hls-converter');
          const hlsResult = await hlsConverter.convertToHLS(tempVideoPath, uniqueFilename.replace('.mp4', ''));
          
          isHLS = true;
          console.log(`[Video Upload] HLS conversion complete: ${hlsResult.segmentKeys.length} segments`);
          
          // Clean up temp file
          fs.unlinkSync(tempVideoPath);
          
          // Return HLS playlist URL instead of direct video URL
          const result = {
            filename: uniqueFilename,
            url: `/api/hls/${uniqueFilename.replace('.mp4', '')}/playlist.m3u8`,
            isHLS: true,
          } as any;
          
          // Still create thumbnail for HLS videos
          if (mimeType.startsWith('image/') || isVideo) {
            try {
              // Write video back to temp for thumbnail creation
              fs.writeFileSync(tempVideoPath, finalBuffer);
              const createdThumbnailFilename = await createMovThumbnail(tempVideoPath);
              
              if (createdThumbnailFilename) {
                console.log(`Video thumbnail created successfully: ${createdThumbnailFilename}`);
                result.thumbnailUrl = `/api/serve-file?filename=${createdThumbnailFilename}`;
                fs.unlinkSync(tempVideoPath);
              } else {
                fs.unlinkSync(tempVideoPath);
                result.thumbnailUrl = null;
              }
            } catch (error) {
              console.error(`Failed to create thumbnail for HLS video: ${error}`);
              result.thumbnailUrl = null;
            }
          }
          
          return result;
        } catch (error) {
          console.error(`[Video Upload] HLS conversion failed: ${error}`);
          // Fall back to regular MP4 upload
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
          console.log(`[Video Upload] Falling back to regular MP4 upload`);
        }
      }
    }

    // Upload main file to Object Storage (regular MP4 or small video)
    const mainKey = `shared/uploads/${uniqueFilename}`;
    await this.uploadToObjectStorage(mainKey, finalBuffer);

    const result = {
      filename: uniqueFilename,
      url: `/api/object-storage/direct-download?storageKey=${mainKey}`,
      isHLS: false,
    } as any;

    // Create and upload thumbnail if needed
    if (mimeType.startsWith('image/') || isVideo) {
      try {
        let thumbnailBuffer: Buffer;
        // Create thumbnail filename to match the video filename
        let thumbnailFilename: string;

        if (isVideo) {
          // Create temporary file for video processing (use converted file)
          const tempVideoPath = `/tmp/${uniqueFilename}`;

          fs.writeFileSync(tempVideoPath, finalBuffer);

          // Call createMovThumbnail which will create a thumbnail with matching filename
          const createdThumbnailFilename = await createMovThumbnail(tempVideoPath);

          if (createdThumbnailFilename) {
            // The thumbnail should already be uploaded to Object Storage by createMovThumbnail
            console.log(`Video thumbnail created successfully: ${createdThumbnailFilename}`);
            
            // Set the thumbnail URL
            result.thumbnailUrl = `shared/uploads/${createdThumbnailFilename}`;

            // Clean up temp video file
            fs.unlinkSync(tempVideoPath);
          } else {
            // Clean up temp video file
            fs.unlinkSync(tempVideoPath);
            throw new Error('Video thumbnail creation failed');
          }
        }
        // No thumbnail creation for images - they will be displayed as-is

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
    console.log(`Attempting to download file from Object Storage: ${storageKey}`);
    
    const result = await this.retryOperation(
      () => this.objectStorage.downloadAsBytes(storageKey),
      `Download ${storageKey}`
    );

    console.log(`Download result for ${storageKey}:`, {
      type: typeof result,
      hasOkProperty: result && typeof result === 'object' && 'ok' in result,
      isBuffer: Buffer.isBuffer(result)
    });

    // Handle the result format from Object Storage API
    if (result && typeof result === 'object' && 'ok' in result) {
      const typedResult = result as { ok: boolean; data?: Buffer | Buffer[]; value?: Buffer | Buffer[]; error?: any };
      if (typedResult.ok) {
        // Try different property names for the data
        let data = typedResult.data || typedResult.value;
        
        // Check if data is an array (Object Storage returns value as [Buffer])
        if (Array.isArray(data) && data.length > 0 && Buffer.isBuffer(data[0])) {
          data = data[0];
        }
        
        if (data && Buffer.isBuffer(data)) {
          console.log(`Successfully downloaded ${storageKey}, size: ${data.length} bytes`);
          return data;
        }
        throw new Error(`Download successful but no valid data found for ${storageKey}`);
      }
      
      // Handle error case with better error message
      let errorMessage = 'Unknown download error';
      if (typedResult.error) {
        if (typeof typedResult.error === 'string') {
          errorMessage = typedResult.error;
        } else if (typedResult.error.message) {
          errorMessage = typedResult.error.message;
        } else {
          errorMessage = JSON.stringify(typedResult.error);
        }
      }
      throw new Error(`Download failed for ${storageKey}: ${errorMessage}`);
    }

    // Assume it's a Buffer if not in the ok/error format
    if (Buffer.isBuffer(result)) {
      console.log(`Successfully downloaded ${storageKey}, size: ${result.length} bytes (direct buffer)`);
      return result;
    }

    throw new Error(`Unexpected download result format for ${storageKey}: ${typeof result}`);
  }

  /**
   * Download file as a stream (for large files like videos)
   * This avoids loading the entire file into memory
   */
  downloadAsStream(storageKey: string): NodeJS.ReadableStream {
    console.log(`Streaming file from Object Storage: ${storageKey}`);
    return this.objectStorage.downloadAsStream(storageKey);
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