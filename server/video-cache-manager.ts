import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { spartaObjectStorage } from './sparta-object-storage-final';

interface CacheEntry {
  filePath: string;
  size: number;
  lastAccess: number;
  storageKey: string;
  downloading: boolean;
}

/**
 * Disk-backed video cache manager
 * Downloads videos from Object Storage once, serves from disk for all subsequent requests
 * Uses LRU eviction to manage disk space
 */
export class VideoCacheManager {
  private cacheDir: string;
  private cache: Map<string, CacheEntry>;
  private maxCacheSize: number; // bytes
  private downloadLocks: Map<string, Promise<string>>;

  constructor(
    cacheDir: string = '/tmp/video-cache',
    maxCacheSize: number = 500 * 1024 * 1024 // 500MB default
  ) {
    this.cacheDir = cacheDir;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.downloadLocks = new Map();

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`Created video cache directory: ${this.cacheDir}`);
    }

    // Load existing cache entries
    this.loadCacheFromDisk();
  }

  /**
   * Scan cache directory and build initial cache map
   */
  private loadCacheFromDisk(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          // Extract storage key from filename (format: storageKey.replace(/\//g, '_'))
          const storageKey = file.replace(/_/g, '/');
          
          this.cache.set(storageKey, {
            filePath,
            size: stats.size,
            lastAccess: stats.mtimeMs,
            storageKey,
            downloading: false,
          });
        }
      }
      
      console.log(`Loaded ${this.cache.size} videos from cache directory`);
    } catch (error) {
      console.error('Error loading cache from disk:', error);
    }
  }

  /**
   * Get file path for a video, downloading if necessary
   * Returns file path for streaming
   */
  async getVideoFile(storageKey: string): Promise<string> {
    // Check if already in cache
    const cached = this.cache.get(storageKey);
    if (cached && fs.existsSync(cached.filePath)) {
      // Update last access time
      cached.lastAccess = Date.now();
      console.log(`Cache hit for ${storageKey}`);
      return cached.filePath;
    }

    // Check if already downloading
    const existingDownload = this.downloadLocks.get(storageKey);
    if (existingDownload) {
      console.log(`Waiting for existing download of ${storageKey}`);
      return existingDownload;
    }

    // Start download
    const downloadPromise = this.downloadVideo(storageKey);
    this.downloadLocks.set(storageKey, downloadPromise);

    try {
      const filePath = await downloadPromise;
      return filePath;
    } finally {
      this.downloadLocks.delete(storageKey);
    }
  }

  /**
   * Download video from Object Storage to disk using HTTP streaming (zero memory buffering)
   */
  private async downloadVideo(storageKey: string): Promise<string> {
    console.log(`Streaming ${storageKey} to cache via HTTP...`);

    // Create safe filename (replace slashes with underscores)
    const safeFilename = storageKey.replace(/\//g, '_');
    const finalPath = path.join(this.cacheDir, safeFilename);
    const tempPath = `${finalPath}.tmp`;

    // Import Object Storage client
    const { Client } = await import('@replit/object-storage');
    const client = new Client();

    try {
      // Use raw HTTP method to get streaming response
      const res: any = await (client as any).raw({
        method: 'GET',
        path: storageKey
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to download ${storageKey}`);
      }

      // Stream response body directly to disk
      const writeStream = fs.createWriteStream(tempPath);
      
      // Convert web ReadableStream to Node stream if needed
      let nodeStream: any = res.body;
      if (res.body && typeof res.body.getReader === 'function') {
        // Convert web stream to Node stream
        nodeStream = Readable.from(res.body);
      }

      // Pipe to disk with zero memory buffering
      await pipeline(nodeStream, writeStream);

      // Get file size
      const stats = fs.statSync(tempPath);
      const fileSize = stats.size;

      console.log(`Streamed ${storageKey} to temp file (${fileSize} bytes)`);

      // Ensure we have enough space before finalizing
      await this.ensureSpace(fileSize);

      // Move temp file to final location
      fs.renameSync(tempPath, finalPath);

      console.log(`Cached ${storageKey} to ${finalPath}`);

      // Add to cache
      this.cache.set(storageKey, {
        filePath: finalPath,
        size: fileSize,
        lastAccess: Date.now(),
        storageKey,
        downloading: false,
      });

      return finalPath;

    } catch (error) {
      console.error(`Failed to stream ${storageKey}:`, error);
      // Clean up temp/partial files on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      throw error;
    }
  }

  /**
   * Ensure enough space in cache by evicting old entries (LRU)
   */
  private async ensureSpace(requiredBytes: number): Promise<void> {
    let currentSize = 0;
    for (const entry of Array.from(this.cache.values())) {
      currentSize += entry.size;
    }

    // Evict entries until we have enough space
    while (currentSize + requiredBytes > this.maxCacheSize && this.cache.size > 0) {
      // Find oldest entry (LRU)
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of Array.from(this.cache.entries())) {
        if (!entry.downloading && entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (!oldestKey) {
        break; // All entries are downloading
      }

      // Evict oldest entry
      const entry = this.cache.get(oldestKey)!;
      console.log(`Evicting ${oldestKey} from cache (${entry.size} bytes)`);
      
      try {
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
      } catch (error) {
        console.error(`Error deleting cached file ${entry.filePath}:`, error);
      }

      currentSize -= entry.size;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear all cached videos
   */
  clearCache(): void {
    console.log('Clearing video cache...');
    
    for (const entry of Array.from(this.cache.values())) {
      try {
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
      } catch (error) {
        console.error(`Error deleting ${entry.filePath}:`, error);
      }
    }

    this.cache.clear();
    console.log('Video cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let totalSize = 0;
    for (const entry of Array.from(this.cache.values())) {
      totalSize += entry.size;
    }

    return {
      entries: this.cache.size,
      totalSize,
      maxSize: this.maxCacheSize,
      utilization: (totalSize / this.maxCacheSize) * 100,
    };
  }
}

// Export singleton instance
export const videoCacheManager = new VideoCacheManager();
