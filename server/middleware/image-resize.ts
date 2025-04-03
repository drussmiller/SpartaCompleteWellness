
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { logger } from '../logger';

const uploadsDir = path.join(process.cwd(), 'uploads');
const thumbnailDir = path.join(uploadsDir, 'thumbnails');

// Ensure directories exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true });
}

export async function resizeUploadedImage(filePath: string): Promise<void> {
  try {
    const filename = path.basename(filePath);
    
    // Create thumbnails of different sizes
    await Promise.all([
      sharp(filePath)
        .resize({ width: 150, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toFile(path.join(thumbnailDir, `thumb-sm-${filename}`)),
      sharp(filePath)
        .resize({ width: 300, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(path.join(thumbnailDir, `thumb-${filename}`)),
      sharp(filePath)
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(thumbnailDir, `thumb-lg-${filename}`))
    ]);
    
    logger.info(`Created thumbnails for ${filename}`);
  } catch (error) {
    logger.error('Error creating thumbnails:', error);
    throw new Error(`Failed to create thumbnails: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
