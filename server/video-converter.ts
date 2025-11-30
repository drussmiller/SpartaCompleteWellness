import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Probe video codec to determine if transcoding is needed
 * @param inputPath - Path to input video file
 * @returns Promise resolving to codec name (e.g., 'h264', 'hevc')
 */
interface VideoProbeResult {
  codec: string;
  pixelFormat: string;
}

async function probeVideoCodec(inputPath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const codec = videoStream?.codec_name?.toLowerCase() || 'unknown';
      const pixelFormat = videoStream?.pix_fmt?.toLowerCase() || 'unknown';
      console.log(`[Video Probe] Detected codec: ${codec}, pixel format: ${pixelFormat}`);
      resolve({ codec, pixelFormat });
    });
  });
}

/**
 * Convert any video to Edge-compatible H.264/AAC MP4 with faststart
 * - If already H.264: remux with faststart (fast)
 * - If HEVC/H.265 or other: transcode to H.264 (slower but compatible)
 * @param inputPath - Path to input video file
 * @param outputPath - Path for output MP4 file
 * @returns Promise that resolves when conversion is complete
 */
export async function convertToMp4WithFaststart(
  inputPath: string,
  outputPath: string
): Promise<void> {
  const { codec, pixelFormat } = await probeVideoCodec(inputPath);
  // Always transcode for maximum browser compatibility
  // iOS MOV files even with H.264/yuv420p can have encoding features that browsers don't support
  const needsTranscode = true; // Force transcoding for all videos
  
  return new Promise((resolve, reject) => {
    if (needsTranscode) {
      console.log(`[Video Convert] Transcoding ${codec}/${pixelFormat} → H.264 baseline/yuv420p for maximum browser compatibility: ${path.basename(inputPath)}`);
      
      (ffmpeg(inputPath) as any)
        .outputOptions([
          '-c:v libx264',              // Transcode video to H.264
          '-preset veryfast',          // Fast encoding (good enough quality)
          '-profile:v baseline',       // H.264 Baseline Profile (maximum mobile compatibility)
          '-level 3.1',                // Wide compatibility with mobile devices
          '-pix_fmt yuv420p',          // Required pixel format for most browsers
          '-c:a aac',                  // Transcode audio to AAC
          '-b:a 160k',                 // Audio bitrate
          '-movflags +faststart'       // Move metadata to beginning for streaming
        ])
        .on('start', (commandLine: string) => {
          console.log(`[Video Convert] FFmpeg: ${commandLine.substring(0, 100)}...`);
        })
        .on('end', () => {
          console.log(`[Video Convert] Transcoding complete: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error(`[Video Convert] Error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    } else {
      console.log(`[Video Remux] H.264 detected, remuxing with faststart: ${path.basename(inputPath)}`);
      
      (ffmpeg(inputPath) as any)
        .outputOptions([
          '-c copy',                      // Copy codecs (no re-encoding, fast!)
          '-movflags +faststart'          // Move metadata to beginning for streaming
        ])
        .on('start', (commandLine: string) => {
          console.log(`[Video Remux] FFmpeg: ${commandLine.substring(0, 100)}...`);
        })
        .on('end', () => {
          console.log(`[Video Remux] Complete: ${path.basename(outputPath)}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error(`[Video Remux] Error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    }
  });
}

/**
 * Check if a video file is MOV format and needs conversion to MP4
 * @param videoPath - Path to video file
 * @returns Promise resolving to true if it's a MOV file
 */
export async function isMovFile(videoPath: string): Promise<boolean> {
  const ext = path.extname(videoPath).toLowerCase();
  return ext === '.mov';
}
