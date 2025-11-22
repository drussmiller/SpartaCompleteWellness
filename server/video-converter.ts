import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Convert video to H.264/MP4 format for browser compatibility (Safari, Edge, etc)
 * @param inputPath - Path to input video file
 * @param outputPath - Path for output MP4 file (will be .mp4)
 * @returns Promise that resolves when conversion is complete
 */
export async function convertToH264Mp4(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Video Conversion] Converting to H.264/MP4: ${path.basename(inputPath)}`);
    
    ffmpeg(inputPath)
      .videoCodec('libx264')           // H.264 codec (universally compatible)
      .audioCodec('aac')                // AAC audio (universally compatible)
      .outputOptions([
        '-preset fast',                 // Faster encoding
        '-crf 23',                      // Quality (18-28 range, 23 is good default)
        '-pix_fmt yuv420p',            // Pixel format for maximum compatibility
        '-movflags +faststart',        // Enable progressive playback/streaming
        '-profile:v baseline',         // Baseline profile (works on all devices)
        '-level 3.0'                   // H.264 level for compatibility
      ])
      .on('start', (commandLine: string) => {
        console.log(`[Video Conversion] FFmpeg command: ${commandLine.substring(0, 100)}...`);
      })
      .on('progress', (progress: any) => {
        if (progress.percent) {
          console.log(`[Video Conversion] Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`[Video Conversion] Complete: ${path.basename(outputPath)}`);
        resolve();
      })
      .on('error', (err: Error) => {
        console.error(`[Video Conversion] Error: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Check if a video file needs conversion to H.264 based on its codec
 * @param videoPath - Path to video file
 * @returns Promise resolving to true if conversion is needed
 */
export async function needsConversion(videoPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    (ffmpeg as any).ffprobe(videoPath, (err: any, metadata: any) => {
      if (err) {
        console.error(`[Video Conversion] Error probing: ${err.message}`);
        // If we can't probe, assume it needs conversion to be safe
        resolve(true);
        return;
      }

      // Check video codec
      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      if (!videoStream) {
        console.log(`[Video Conversion] No video stream found, needs conversion`);
        resolve(true);
        return;
      }

      const codec = videoStream.codec_name?.toLowerCase();
      console.log(`[Video Conversion] Detected codec: ${codec}`);

      // H.264 (h264/avc/avc1) is universally compatible
      // Everything else (HEVC/H.265, VP9, etc) needs conversion
      const isH264 = codec === 'h264' || codec === 'avc' || codec === 'avc1';
      const needsConv = !isH264;
      
      console.log(`[Video Conversion] Conversion ${needsConv ? 'REQUIRED' : 'NOT NEEDED'}`);
      resolve(needsConv);
    });
  });
}
