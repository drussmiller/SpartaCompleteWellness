import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createMovThumbnail } from './mov-frame-extractor-new.js';
import { Readable } from 'stream';

const replitStorageClient = new Client();

export class SpartaObjectStorageFinal {
  private allowedTypes: string[];
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(
    allowedTypes: string[] = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mov', 'video/avi', 'video/quicktime'
    ]
  ) {
    this.allowedTypes = allowedTypes;
    console.log(`Object Storage Final client initialized with @replit/object-storage Client`);
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
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

  async uploadToObjectStorage(key: string, buffer: Buffer): Promise<void> {
    console.log(`[UPLOAD-V2] Starting upload for ${key}, buffer size: ${buffer.length}`);
    await this.retryOperation(
      async () => {
        const result = await replitStorageClient.uploadFromBytes(key, buffer);
        if (!result.ok) {
          throw new Error(`Upload failed: ${(result as any).error?.message || 'Unknown error'}`);
        }
      },
      `Upload ${key}`
    );
    console.log(`[UPLOAD-V2] Successfully uploaded ${key} to Object Storage`);
  }

  async storeFile(
    fileData: Buffer | string,
    originalFilename: string,
    mimeType: string,
    isVideo: boolean = false
  ): Promise<{
    filename: string;
    url: string;
    thumbnailUrl?: string;
    isHLS?: boolean;
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

    const originalFileSize = fileBuffer.length;

    const timestamp = Date.now();
    let fileExt = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, fileExt);
    let uniqueFilename = `${timestamp}-${baseName}${fileExt}`;
    let finalBuffer = fileBuffer;

    if (isVideo) {
      const { HLSConverter } = await import('./hls-converter');
      
      if (HLSConverter.shouldConvertToHLS(originalFileSize)) {
        console.log(`[Video Upload] Large video (${(originalFileSize / 1024 / 1024).toFixed(2)} MB) → Direct HLS conversion (skipping MP4)`);
        
        const tempSourcePath = `/tmp/${timestamp}-${baseName}-hls-source${fileExt}`;
        fs.writeFileSync(tempSourcePath, fileBuffer);
        
        try {
          const { hlsConverter } = await import('./hls-converter');
          const baseFilename = `${timestamp}-${baseName}`;
          const hlsResult = await hlsConverter.convertToHLS(tempSourcePath, baseFilename);
          
          console.log(`[Video Upload] HLS conversion complete: ${hlsResult.segmentKeys.length} segments`);
          
          let thumbnailUrl: string | undefined = undefined;
          try {
            const createdThumbnailFilename = await createMovThumbnail(tempSourcePath);
            if (createdThumbnailFilename) {
              thumbnailUrl = `/api/serve-file?filename=shared/uploads/${createdThumbnailFilename}`;
              console.log(`[Video Upload] HLS thumbnail created: ${createdThumbnailFilename}`);
            }
          } catch (error) {
            console.error(`[Video Upload] HLS thumbnail creation failed: ${error}`);
          } finally {
            if (fs.existsSync(tempSourcePath)) {
              fs.unlinkSync(tempSourcePath);
            }
          }
          
          return {
            filename: `${baseFilename}.mp4`,
            url: `/api/hls/${baseFilename}/playlist.m3u8`,
            thumbnailUrl,
            isHLS: true,
          };
        } catch (error) {
          console.error(`[Video Upload] HLS conversion failed: ${error}`);
          if (fs.existsSync(tempSourcePath)) {
            fs.unlinkSync(tempSourcePath);
          }
          console.log(`[Video Upload] Falling back to MP4 upload`);
        }
      }
    }

    if (isVideo) {
      const { convertToMp4WithFaststart } = await import('./video-converter');
      
      console.log(`[Video Upload] Small video → MP4 conversion with faststart`);
      
      const tempSourcePath = `/tmp/${timestamp}-${baseName}-source${fileExt}`;
      const mp4Filename = `${timestamp}-${baseName}.mp4`;
      const tempMp4Path = `/tmp/${mp4Filename}`;
      
      fs.writeFileSync(tempSourcePath, fileBuffer);

      try {
        await convertToMp4WithFaststart(tempSourcePath, tempMp4Path);
        finalBuffer = fs.readFileSync(tempMp4Path);
        uniqueFilename = mp4Filename;
        
        fs.unlinkSync(tempMp4Path);
        fs.unlinkSync(tempSourcePath);
        
        console.log(`[Video Upload] MP4 conversion complete: ${uniqueFilename}`);
      } catch (error) {
        if (fs.existsSync(tempSourcePath)) fs.unlinkSync(tempSourcePath);
        if (fs.existsSync(tempMp4Path)) fs.unlinkSync(tempMp4Path);
        throw error;
      }
    }

    const mainKey = `shared/uploads/${uniqueFilename}`;
    await this.uploadToObjectStorage(mainKey, finalBuffer);

    const result = {
      filename: uniqueFilename,
      url: `/api/object-storage/direct-download?storageKey=${mainKey}`,
      isHLS: false,
    } as any;

    if (mimeType.startsWith('image/') || isVideo) {
      try {
        if (isVideo) {
          const tempVideoPath = `/tmp/${uniqueFilename}`;
          fs.writeFileSync(tempVideoPath, finalBuffer);

          const createdThumbnailFilename = await createMovThumbnail(tempVideoPath);

          if (createdThumbnailFilename) {
            console.log(`Video thumbnail created successfully: ${createdThumbnailFilename}`);
            result.thumbnailUrl = `/api/serve-file?filename=shared/uploads/${createdThumbnailFilename}`;
            fs.unlinkSync(tempVideoPath);
          } else {
            fs.unlinkSync(tempVideoPath);
            throw new Error('Video thumbnail creation failed');
          }
        }
      } catch (error) {
        console.error(`Failed to create thumbnail for ${uniqueFilename}:`, (error as Error).message);
        result.thumbnailUrl = result.url;
      }
    }

    return result;
  }

  async deleteFile(storageKey: string): Promise<void> {
    await this.retryOperation(
      async () => {
        const result = await replitStorageClient.delete(storageKey);
        if (!result.ok) {
          throw new Error(`Delete failed: ${(result as any).error?.message || 'Unknown error'}`);
        }
      },
      `Delete ${storageKey}`
    );
    console.log(`Deleted from Object Storage: ${storageKey}`);
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const result = await replitStorageClient.exists(storageKey);
      if (result.ok) {
        return result.value;
      }
      return false;
    } catch (error) {
      console.log(`File existence check failed for ${storageKey}:`, (error as Error).message);
      return false;
    }
  }

  async downloadFile(storageKey: string): Promise<Buffer> {
    console.log(`Attempting to download file from Object Storage: ${storageKey}`);
    
    const result = await this.retryOperation(
      async () => {
        const dl = await replitStorageClient.downloadAsBytes(storageKey);
        if (!dl.ok) {
          throw new Error(`Download failed: ${(dl as any).error?.message || 'Unknown error'}`);
        }
        return Buffer.from(dl.value[0]);
      },
      `Download ${storageKey}`
    );

    console.log(`Successfully downloaded ${storageKey}, size: ${result.length} bytes`);
    return result;
  }

  downloadAsStream(storageKey: string): NodeJS.ReadableStream {
    console.log(`Streaming file from Object Storage: ${storageKey}`);
    const passthrough = new (require('stream').PassThrough)();
    
    replitStorageClient.downloadAsBytes(storageKey).then((dl: any) => {
      if (dl.ok) {
        passthrough.end(Buffer.from(dl.value[0]));
      } else {
        passthrough.destroy(new Error(`Stream download failed: ${dl.error?.message || 'Unknown error'}`));
      }
    }).catch((err: any) => {
      passthrough.destroy(err);
    });
    
    return passthrough;
  }

  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const options = prefix ? { prefix } : {};
      const result = await replitStorageClient.list(options as any);
      if (result.ok) {
        return result.value.map((obj: any) => typeof obj === 'string' ? obj : obj.name);
      }
      return [];
    } catch (error) {
      console.error(`Failed to list files:`, (error as Error).message);
      return [];
    }
  }
}

export const spartaObjectStorage = new SpartaObjectStorageFinal();
