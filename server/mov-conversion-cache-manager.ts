import fs from 'fs';
import path from 'path';
import { convertToMp4WithFaststart } from './video-converter';

interface ConversionCacheEntry {
  mp4FilePath: string;
  size: number;
  lastAccess: number;
  originalStorageKey: string;
  converting: boolean;
}

/**
 * MOV→MP4 conversion cache manager
 * Downloads MOV files from Object Storage, converts them to MP4, and serves the MP4
 * Uses LRU eviction to manage disk space
 */
export class MovConversionCacheManager {
  private cacheDir: string;
  private cache: Map<string, ConversionCacheEntry>;
  private maxCacheSize: number; // bytes
  private conversionLocks: Map<string, Promise<string>>;

  constructor(
    cacheDir: string = '/tmp/mov-conversion-cache',
    maxCacheSize: number = 500 * 1024 * 1024 // 500MB default
  ) {
    this.cacheDir = cacheDir;
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.conversionLocks = new Map();

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`Created MOV conversion cache directory: ${this.cacheDir}`);
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
        // Only load .mp4 files (ignore .mov source files or .tmp files)
        if (!file.endsWith('.mp4')) {
          continue;
        }

        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          // Extract storage key from filename (format: storageKey.replace(/\//g, '_').replace('.MOV', '.mp4'))
          const storageKey = file.replace(/_/g, '/').replace('.mp4', '.MOV');
          
          this.cache.set(storageKey, {
            mp4FilePath: filePath,
            size: stats.size,
            lastAccess: stats.mtimeMs,
            originalStorageKey: storageKey,
            converting: false,
          });
        }
      }
      
      let totalSize = 0;
      for (const entry of Array.from(this.cache.values())) {
        totalSize += entry.size;
      }
      const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
      console.log(`[MOV CONVERSION CACHE INIT] Loaded ${this.cache.size} converted MP4s (${totalMB}MB total) from ${this.cacheDir}`);
    } catch (error) {
      console.error('Error loading MOV conversion cache from disk:', error);
    }
  }

  /**
   * Get MP4 file path for a MOV video, converting if necessary
   * Returns MP4 file path for streaming
   */
  async getConvertedMp4(storageKey: string): Promise<string> {
    // Normalize the storage key (ensure it ends with .MOV)
    const normalizedKey = storageKey.toUpperCase().endsWith('.MOV') 
      ? storageKey 
      : storageKey;

    // Check if already converted and in cache
    const cached = this.cache.get(normalizedKey);
    if (cached && fs.existsSync(cached.mp4FilePath)) {
      // Update last access time
      cached.lastAccess = Date.now();
      const sizeMB = (cached.size / (1024 * 1024)).toFixed(2);
      const stats = this.getStats();
      const cacheMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
      console.log(`[MOV CONVERSION CACHE HIT] ${normalizedKey} (${sizeMB}MB MP4) - Cache: ${cacheMB}/${stats.maxSize / (1024 * 1024)}MB (${stats.utilization.toFixed(1)}%)`);
      return cached.mp4FilePath;
    }

    // Check if already converting
    const existingConversion = this.conversionLocks.get(normalizedKey);
    if (existingConversion) {
      console.log(`[MOV CONVERSION] Waiting for existing conversion of ${normalizedKey}`);
      return existingConversion;
    }

    // Start conversion
    console.log(`[MOV CONVERSION CACHE MISS] ${normalizedKey} - Starting download and conversion`);
    const conversionPromise = this.downloadAndConvert(normalizedKey);
    this.conversionLocks.set(normalizedKey, conversionPromise);

    try {
      const mp4FilePath = await conversionPromise;
      return mp4FilePath;
    } finally {
      this.conversionLocks.delete(normalizedKey);
    }
  }

  /**
   * Download MOV from Object Storage, convert to MP4, and cache the result
   */
  private async downloadAndConvert(storageKey: string): Promise<string> {
    const startTime = Date.now();
    console.log(`[MOV CONVERSION START] ${storageKey}`);

    // Extract just the filename from the storage key (e.g., "shared/uploads/filename.MOV" -> "filename.MOV")
    const filename = storageKey.split('/').pop() || storageKey;
    
    // Use /tmp for temp files during conversion to avoid issues with fluent-ffmpeg
    const movTempPath = path.join('/tmp', `mov-source-${Date.now()}-${filename}`);
    const mp4TempPath = path.join('/tmp', `mp4-temp-${Date.now()}-${filename.replace(/\.MOV$/i, '.mp4')}`);
    
    // Final destination in cache directory
    const mp4FinalPath = path.join(this.cacheDir, filename.replace(/\.MOV$/i, '.mp4'));

    // Import Object Storage client
    const { Client } = await import('@replit/object-storage');
    const client = new Client();

    try {
      // Step 1: Download original MOV file
      console.log(`[MOV DOWNLOAD START] ${storageKey}`);
      const downloadResult = await client.downloadToFilename(storageKey, movTempPath);

      if (!downloadResult.ok) {
        throw new Error(`Failed to download ${storageKey}: ${downloadResult.error.message}`);
      }

      const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const movStats = fs.statSync(movTempPath);
      const movSizeMB = (movStats.size / (1024 * 1024)).toFixed(2);
      console.log(`[MOV DOWNLOAD COMPLETE] ${storageKey} - ${movSizeMB}MB in ${downloadTime}s`);

      // Step 2: Convert MOV to MP4
      const conversionStart = Date.now();
      console.log(`[MP4 CONVERSION START] Converting ${storageKey} to MP4 with faststart`);
      
      await convertToMp4WithFaststart(movTempPath, mp4TempPath);
      
      const conversionTime = ((Date.now() - conversionStart) / 1000).toFixed(2);
      const mp4Stats = fs.statSync(mp4TempPath);
      const mp4SizeMB = (mp4Stats.size / (1024 * 1024)).toFixed(2);
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`[MP4 CONVERSION COMPLETE] ${storageKey} - ${mp4SizeMB}MB MP4 in ${conversionTime}s (total: ${totalTime}s)`);

      // Step 3: Clean up MOV temp file (we don't need it anymore)
      fs.unlinkSync(movTempPath);

      // Step 4: Ensure we have enough space before finalizing
      await this.ensureSpace(mp4Stats.size);

      // Step 5: Move temp MP4 to final location
      fs.renameSync(mp4TempPath, mp4FinalPath);

      const cacheStats = this.getStats();
      const cacheMB = (cacheStats.totalSize / (1024 * 1024)).toFixed(2);
      console.log(`[MP4 CACHED] ${storageKey} → ${mp4FinalPath} - Cache now: ${cacheMB}/${cacheStats.maxSize / (1024 * 1024)}MB (${cacheStats.utilization.toFixed(1)}%)`);

      // Step 6: Add to cache
      this.cache.set(storageKey, {
        mp4FilePath: mp4FinalPath,
        size: mp4Stats.size,
        lastAccess: Date.now(),
        originalStorageKey: storageKey,
        converting: false,
      });

      return mp4FinalPath;

    } catch (error) {
      console.error(`Failed to convert ${storageKey}:`, error);
      // Clean up temp/partial files on error
      if (fs.existsSync(movTempPath)) {
        fs.unlinkSync(movTempPath);
      }
      if (fs.existsSync(mp4TempPath)) {
        fs.unlinkSync(mp4TempPath);
      }
      if (fs.existsSync(mp4FinalPath)) {
        fs.unlinkSync(mp4FinalPath);
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
        if (!entry.converting && entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (!oldestKey) {
        break; // All entries are converting
      }

      // Evict oldest entry
      const entry = this.cache.get(oldestKey)!;
      const sizeMB = (entry.size / (1024 * 1024)).toFixed(2);
      const requiredMB = (requiredBytes / (1024 * 1024)).toFixed(2);
      console.log(`[MOV CONVERSION CACHE EVICTION] Removing ${oldestKey} MP4 (${sizeMB}MB) to make room for new conversion (${requiredMB}MB needed)`);
      
      try {
        if (fs.existsSync(entry.mp4FilePath)) {
          fs.unlinkSync(entry.mp4FilePath);
        }
      } catch (error) {
        console.error(`Error deleting cached MP4 ${entry.mp4FilePath}:`, error);
      }

      currentSize -= entry.size;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear all cached MP4s
   */
  clearCache(): void {
    console.log('Clearing MOV conversion cache...');
    
    for (const entry of Array.from(this.cache.values())) {
      try {
        if (fs.existsSync(entry.mp4FilePath)) {
          fs.unlinkSync(entry.mp4FilePath);
        }
      } catch (error) {
        console.error(`Error deleting ${entry.mp4FilePath}:`, error);
      }
    }

    this.cache.clear();
    console.log('MOV conversion cache cleared');
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
export const movConversionCacheManager = new MovConversionCacheManager();
