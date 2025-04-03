
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../logger';

// Ensure thumbnails directory exists
const thumbnailDir = path.join(process.cwd(), 'uploads', 'thumbnails');
fs.mkdir(thumbnailDir, { recursive: true }).catch(err => {
  logger.error('Error creating thumbnails directory:', err);
});

export async function resizeUploadedImage(filePath: string): Promise<void> {
  try {
    const filename = path.basename(filePath);
    const thumbnailPath = path.join(thumbnailDir, filename);
    
    // Create thumbnails of different sizes
    await Promise.all([
      sharp(filePath)
        .resize({ width: 150 })
        .jpeg({ quality: 70 })
        .toFile(thumbnailPath.replace('thumb-', 'thumb-sm-')),
      sharp(filePath)
        .resize({ width: 300 })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath),
      sharp(filePath)
        .resize({ width: 600 })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath.replace('thumb-', 'thumb-lg-'))
    ]);
      
    logger.info(`Created thumbnail for ${filename}`);
  } catch (error) {
    logger.error('Error resizing image:', error);
  }
}

export function getThumbnailUrl(originalUrl: string): string {
  if (!originalUrl || !originalUrl.startsWith('/uploads/')) {
    return originalUrl;
  }
  
  const filename = path.basename(originalUrl);
  return `/uploads/thumbnails/${filename}`;
}
