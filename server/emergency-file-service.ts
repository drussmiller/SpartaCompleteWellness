/**
 * Emergency File Service
 * 
 * This service provides immediate file serving responses when Object Storage is experiencing
 * connectivity issues. It implements a circuit breaker pattern to prevent hanging requests.
 */

import { Request, Response } from 'express';
import { logger } from './logger';
import * as path from 'path';

interface EmergencyFileServiceResult {
  success: boolean;
  buffer?: Buffer;
  contentType?: string;
  error?: string;
  source?: 'cache' | 'storage' | 'fallback';
}

class EmergencyFileService {
  private circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly FAILURE_THRESHOLD = 3;
  private readonly CIRCUIT_TIMEOUT = 30000; // 30 seconds
  private objectStorageClient: any = null;
  private isInitialized = false;

  constructor() {
    this.initializeWithTimeout();
  }

  private async initializeWithTimeout(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Quick initialization check
      if (!process.env.REPLIT_DB_ID) {
        logger.warn('Object Storage not available - no REPLIT_DB_ID');
        this.circuitBreakerState = 'open';
        return;
      }

      // Attempt initialization with short timeout
      const initTimeout = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Initialization timeout')), 2000)
      );

      const { Client } = await Promise.race([
        import('@replit/object-storage'),
        initTimeout
      ]);

      this.objectStorageClient = new Client();
      this.isInitialized = true;
      logger.info('Emergency file service initialized successfully');
    } catch (error) {
      logger.error('Emergency file service initialization failed:', error instanceof Error ? error : new Error(String(error)));
      this.circuitBreakerState = 'open';
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
      '.webm': 'video/webm'
    };
    return contentTypes[ext] || 'application/octet-stream';
  }

  private canAttemptStorage(): boolean {
    if (this.circuitBreakerState === 'closed') return true;
    
    if (this.circuitBreakerState === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime > this.CIRCUIT_TIMEOUT) {
        this.circuitBreakerState = 'half-open';
        return true;
      }
      return false;
    }
    
    // half-open state - allow limited attempts
    return true;
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    this.circuitBreakerState = 'closed';
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitBreakerState = 'open';
      logger.warn(`Circuit breaker opened due to ${this.failureCount} consecutive failures`);
    }
  }

  private async quickDownload(key: string): Promise<Buffer | null> {
    if (!this.objectStorageClient || !this.canAttemptStorage()) {
      return null;
    }

    // Extremely aggressive timeout for emergency response
    const downloadTimeout = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Emergency timeout')), 500)
    );

    try {
      const result = await Promise.race([
        this.objectStorageClient.downloadAsBytes(key),
        downloadTimeout
      ]);

      // Handle different result formats quickly
      if (Buffer.isBuffer(result)) {
        this.recordSuccess();
        return result;
      } else if (result && typeof result === 'object' && 'ok' in result && result.ok) {
        const data = (result as any).value || (result as any).data;
        if (Buffer.isBuffer(data)) {
          this.recordSuccess();
          return data;
        }
      }
      
      this.recordFailure();
      return null;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  async serveFile(filename: string): Promise<EmergencyFileServiceResult> {
    await this.initializeWithTimeout();

    if (!this.canAttemptStorage()) {
      return {
        success: false,
        error: 'Object Storage temporarily unavailable due to connectivity issues',
        source: 'fallback'
      };
    }

    // Try only the most likely key patterns with minimal timeout
    const keyPatterns = [
      `shared/uploads/${filename}`,
      `uploads/${filename}`
    ];

    for (const key of keyPatterns) {
      try {
        const buffer = await this.quickDownload(key);
        
        if (buffer && buffer.length > 0) {
          logger.info(`Emergency service delivered file: ${key} (${buffer.length} bytes)`);
          return {
            success: true,
            buffer,
            contentType: this.getContentType(filename),
            source: 'storage'
          };
        }
      } catch (error) {
        // Continue to next key pattern
        continue;
      }
    }

    return {
      success: false,
      error: 'File not accessible at this time',
      source: 'fallback'
    };
  }

  async handleFileRequest(req: Request, res: Response): Promise<void> {
    const filename = req.query.filename as string;
    
    if (!filename) {
      res.status(400).json({ error: 'Filename parameter required' });
      return;
    }

    const startTime = Date.now();
    
    try {
      const result = await this.serveFile(filename);
      const responseTime = Date.now() - startTime;
      
      if (result.success && result.buffer) {
        res.set({
          'Content-Type': result.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
          'Content-Length': result.buffer.length.toString(),
          'X-Response-Time': `${responseTime}ms`,
          'X-Source': result.source || 'unknown'
        });
        res.send(result.buffer);
        logger.info(`Emergency file service delivered ${filename} in ${responseTime}ms`);
      } else {
        res.status(404).json({
          error: 'File not available',
          message: result.error || 'Could not retrieve file',
          responseTime: `${responseTime}ms`,
          circuitState: this.circuitBreakerState
        });
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`Emergency file service error for ${filename} (${responseTime}ms):`, error instanceof Error ? error : new Error(String(error)));
      
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'File service is experiencing technical difficulties',
        responseTime: `${responseTime}ms`,
        circuitState: this.circuitBreakerState
      });
    }
  }
}

export const emergencyFileService = new EmergencyFileService();