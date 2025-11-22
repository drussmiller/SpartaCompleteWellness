import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

/**
 * Convert video to H.264/MP4 format for Safari compatibility
 * @param inputPath - Path to input video file
 * @param outputPath - Path for output MP4 file
 * @returns Promise that resolves when conversion is complete
 */
export async function convertToH264Mp4(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Converting video to H.264/MP4: ${inputPath} -> ${outputPath}`);
    
    ffmpeg(inputPath)
      .videoCodec('libx264')           // H.264 codec (Safari compatible)
      .audioCodec('aac')                // AAC audio (Safari compatible)
      .outputOptions([
        '-preset fast',                 // Faster encoding
        '-crf 23',                      // Quality (lower = better, 18-28 is good)
        '-pix_fmt yuv420p',            // Pixel format for compatibility
        '-movflags +faststart',        // Enable streaming/progressive playback
        '-profile:v baseline',         // Baseline profile for maximum compatibility
        '-level 3.0'                   // H.264 level for compatibility
      ])
      .on('start', (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Conversion progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`Conversion complete: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`Conversion error: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Check if a video file needs conversion based on codec
 * @param videoPath - Path to video file
 * @returns Promise resolving to true if conversion is needed
 */
export async function needsConversion(videoPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error(`Error probing video: ${err.message}`);
        // If we can't probe, assume it needs conversion
        resolve(true);
        return;
      }

      // Check video codec
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        resolve(true);
        return;
      }

      const codec = videoStream.codec_name?.toLowerCase();
      console.log(`Video codec detected: ${codec}`);

      // H.264 (avc1/h264) is Safari compatible, no conversion needed
      // HEVC (h265/hevc) needs conversion
      const needsConv = codec !== 'h264' && codec !== 'avc1';
      console.log(`Conversion needed: ${needsConv}`);
      resolve(needsConv);
    });
  });
}
