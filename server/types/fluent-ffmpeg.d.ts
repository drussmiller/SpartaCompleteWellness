declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    on(event: string, callback: (err?: Error) => void): FfmpegCommand;
    screenshots(options: {
      timestamps: string[];
      filename: string;
      folder: string;
      size?: string;
    }): FfmpegCommand;
  }

  function ffmpeg(file: string): FfmpegCommand;
  export = ffmpeg;
}