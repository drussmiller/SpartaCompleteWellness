/**
 * Robust File Service
 * 
 * This service provides reliable file serving with Object Storage integration
 * and proper timeout handling to prevent hanging requests.
 */

import { Request, Response } from 'express';
import { logger } from './logger';
import * as path from 'path';

interface FileServiceResult {
  success: boolean;
  buffer?: Buffer;
  contentType?: string;
  error?: string;
}

class FileService {
  private objectStorageClient: any = null;
  private isObjectStorageAvailable = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.initializeObjectStorage();
  }

  private async initializeObjectStorage(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Check if Object Storage is available
      if (!process.env.REPLIT_DB_ID) {
        logger.info('Object Storage not available - no REPLIT_DB_ID');
        this.isObjectStorageAvailable = false;
        return;
      }

      // Import with timeout
      const importTimeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Import timeout')), 3000)
      );

      const { Client } = await Promise.race([
        import('@replit/object-storage'),
        importTimeout
      ]);

      this.objectStorageClient = new Client();
      this.isObjectStorageAvailable = true;
      logger.info('Object Storage client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Object Storage', error);
      this.isObjectStorageAvailable = false;
      this.objectStorageClient = null;
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  private async downloadWithTimeout(key: string, timeoutMs: number): Promise<Buffer | null> {
    if (!this.objectStorageClient) {
      return null;
    }

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Download timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.objectStorageClient.downloadAsBytes(key),
        timeoutPromise
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      // Handle different result formats
      if (Buffer.isBuffer(result)) {
        return result;
      } else if (result && typeof result === 'object' && 'ok' in result && result.ok) {
        const data = (result as any).value || (result as any).data;
        if (Buffer.isBuffer(data)) {
          return data;
        }
      }
      return null;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  }

  async serveFile(filename: string): Promise<FileServiceResult> {
    try {
      // Ensure Object Storage is initialized
      await this.initializeObjectStorage();

      if (!this.isObjectStorageAvailable || !this.objectStorageClient) {
        logger.warn(`Object Storage not available for file: ${filename}`);
        return {
          success: false,
          error: 'Object Storage service unavailable - please check configuration'
        };
      }

      // Define key patterns to try
      const keyPatterns = [
        `shared/uploads/${filename}`,
        `uploads/${filename}`,
        `shared/${filename}`,
        filename
      ];

      logger.info(`Attempting to serve file: ${filename}`);

      // Try each key pattern with very aggressive timeout
      for (const key of keyPatterns) {
        try {
          logger.debug(`Trying key: ${key}`);
          const buffer = await this.downloadWithTimeout(key, 800); // Even shorter timeout
          
          if (buffer && buffer.length > 0) {
            logger.info(`Successfully downloaded file with key: ${key}, size: ${buffer.length} bytes`);
            return {
              success: true,
              buffer,
              contentType: this.getContentType(filename)
            };
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('timeout')) {
            logger.warn(`Timeout downloading ${key} - Object Storage may be experiencing connectivity issues`);
          } else {
            logger.debug(`Failed to download with key ${key}: ${errorMsg}`);
          }
          continue;
        }
      }

      logger.warn(`File not found after trying all key patterns for: ${filename}`);
      return {
        success: false,
        error: 'File not found in Object Storage - please verify the file exists and is accessible'
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in file service for ${filename}:`, error instanceof Error ? error : new Error(String(error)));
      
      if (errorMsg.includes('timeout') || errorMsg.includes('Import timeout')) {
        return {
          success: false,
          error: 'Object Storage connection timeout - service may be temporarily unavailable'
        };
      }
      
      return {
        success: false,
        error: 'File service temporarily unavailable'
      };
    }
  }

  async handleFileRequest(req: Request, res: Response): Promise<void> {
    const filename = req.query.filename as string;
    
    if (!filename) {
      res.status(400).json({ error: 'Filename parameter required' });
      return;
    }

    try {
      const result = await this.serveFile(filename);
      
      if (result.success && result.buffer) {
        res.set({
          'Content-Type': result.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000',
          'Content-Length': result.buffer.length.toString()
        });
        res.send(result.buffer);
      } else {
        logger.warn(`File not found: ${filename}`);
        res.status(404).json({
          error: 'File not found',
          message: result.error || 'Could not retrieve file from storage'
        });
      }
    } catch (error) {
      logger.error(`Error serving file ${filename}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve file'
      });
    }
  }
}

export const fileService = new FileService();