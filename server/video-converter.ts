import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Probe video codec to determine if transcoding is needed
 * @param inputPath - Path to input video file
 * @returns Promise resolving to codec name (e.g., 'h264', 'hevc')
 */
async function probeVideoCodec(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const codec = videoStream?.codec_name?.toLowerCase() || 'unknown';
      console.log(`[Video Probe] Detected codec: ${codec}`);
      resolve(codec);
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
  const codec = await probeVideoCodec(inputPath);
  const needsTranscode = codec !== 'h264';
  
  return new Promise((resolve, reject) => {
    if (needsTranscode) {
      console.log(`[Video Convert] Transcoding ${codec} → H.264 for Edge compatibility: ${path.basename(inputPath)}`);
      
      (ffmpeg(inputPath) as any)
        .outputOptions([
          '-c:v libx264',              // Transcode video to H.264
          '-preset veryfast',          // Fast encoding (good enough quality)
          '-profile:v high',           // H.264 High Profile
          '-level 4.1',                // Wide compatibility
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
