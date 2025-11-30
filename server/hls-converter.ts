import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { spartaObjectStorage } from './sparta-object-storage-final';

/**
 * HLS Converter Service
 * Converts large videos (>30 MiB) to HLS format for production-compatible streaming
 * Creates small segments that stay under Replit's ~30 MiB proxy limit
 */

export interface HLSConversionResult {
  playlistKey: string; // Object Storage key for .m3u8 playlist
  segmentKeys: string[]; // Object Storage keys for .ts segments
  duration: number; // Total video duration in seconds
}

export class HLSConverter {
  private readonly SEGMENT_DURATION = 6; // 6 second segments (typically 2-5 MB each)
  private readonly tmpDir = '/tmp/hls-conversion';

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * Convert video to HLS format
   * @param videoPath - Path to source video file
   * @param baseFilename - Base filename for HLS files (without extension)
   * @returns HLS conversion result with playlist and segment keys
   */
  async convertToHLS(videoPath: string, baseFilename: string): Promise<HLSConversionResult> {
    const conversionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workDir = path.join(this.tmpDir, conversionId);
    
    console.log(`[HLS] Starting conversion: ${baseFilename}, workDir: ${workDir}`);
    
    // Create work directory
    fs.mkdirSync(workDir, { recursive: true });

    try {
      const playlistFilename = `${baseFilename}.m3u8`;
      const playlistPath = path.join(workDir, playlistFilename);
      const segmentPattern = path.join(workDir, `${baseFilename}-%03d.ts`);

      // Get video duration first
      const duration = await this.getVideoDuration(videoPath);
      console.log(`[HLS] Video duration: ${duration}s`);

      // Convert to HLS using ffmpeg with proper rotation handling
      // FFmpeg automatically applies rotation metadata when re-encoding (not using -c copy)
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate('128k')
          .outputOptions([
            '-preset veryfast', // Very fast encoding preset (2-3x faster than 'fast')
            '-crf 23', // Constant quality (23 = good quality)
            '-metadata:s:v rotate=0', // Remove rotation metadata after applying it
            '-start_number 0', // Start segment numbering at 0
            `-hls_time ${this.SEGMENT_DURATION}`, // Segment duration in seconds
            '-hls_list_size 0', // Include all segments in playlist
            '-f hls', // HLS format
          ])
          .output(playlistPath)
          .on('start', (cmd) => {
            console.log(`[HLS] FFmpeg command: ${cmd}`);
          })
          .on('progress', (progress) => {
            console.log(`[HLS] Progress: ${progress.percent?.toFixed(1)}%`);
          })
          .on('end', () => {
            console.log(`[HLS] Conversion complete: ${playlistFilename}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`[HLS] Conversion error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      // Upload playlist and segments to Object Storage
      const playlistContent = fs.readFileSync(playlistPath, 'utf-8');
      const playlistKey = `shared/uploads/hls/${baseFilename}/${playlistFilename}`;
      
      await spartaObjectStorage.uploadToObjectStorage(
        playlistKey,
        Buffer.from(playlistContent, 'utf-8')
      );
      console.log(`[HLS] Uploaded playlist: ${playlistKey}`);

      // Find all segment files
      const files = fs.readdirSync(workDir);
      const segmentFiles = files.filter(f => f.endsWith('.ts')).sort();
      console.log(`[HLS] Found ${segmentFiles.length} segments`);

      const segmentKeys: string[] = [];
      for (const segmentFile of segmentFiles) {
        const segmentPath = path.join(workDir, segmentFile);
        const segmentBuffer = fs.readFileSync(segmentPath);
        const segmentKey = `shared/uploads/hls/${baseFilename}/${segmentFile}`;
        
        await spartaObjectStorage.uploadToObjectStorage(segmentKey, segmentBuffer);
        segmentKeys.push(segmentKey);
        
        console.log(`[HLS] Uploaded segment: ${segmentFile} (${(segmentBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
      }

      console.log(`[HLS] Conversion complete: ${segmentKeys.length} segments uploaded`);

      return {
        playlistKey,
        segmentKeys,
        duration,
      };
    } finally {
      // Clean up work directory
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        console.log(`[HLS] Cleaned up work directory: ${workDir}`);
      } catch (err) {
        console.error(`[HLS] Failed to clean up work directory: ${err}`);
      }
    }
  }

  /**
   * Get video duration in seconds
   */
  private getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  }

  /**
   * Check if a video should be converted to HLS based on file size
   * @param fileSizeBytes - File size in bytes
   * @returns true if video should be converted to HLS
   */
  static shouldConvertToHLS(fileSizeBytes: number): boolean {
    const THRESHOLD = 30 * 1024 * 1024; // 30 MiB
    return fileSizeBytes >= THRESHOLD;
  }
}

// Export singleton instance
export const hlsConverter = new HLSConverter();
