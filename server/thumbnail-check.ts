import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { db } from './db';
import { posts } from '../shared/schema';

/**
 * This script lists all posts with images and checks if their thumbnails exist
 * in both formats (with and without "thumb-" prefix).
 */
async function checkThumbnails() {
  console.log('Starting thumbnail check process...');
  
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const thumbnailsDir = path.join(process.cwd(), 'uploads', 'thumbnails');
  
  if (!fs.existsSync(uploadsDir)) {
    console.error(`Uploads directory does not exist: ${uploadsDir}`);
    return;
  }
  
  // Make sure thumbnails directory exists
  if (!fs.existsSync(thumbnailsDir)) {
    console.error(`Thumbnails directory does not exist: ${thumbnailsDir}`);
    return;
  }

  // Get all posts with mediaUrl from the database
  const postsWithMedia = await db
    .select({
      id: posts.id,
      type: posts.type,
      mediaUrl: posts.mediaUrl,
      createdAt: posts.createdAt
    })
    .from(posts)
    .where(db.sql`${posts.mediaUrl} IS NOT NULL`) // Filter for posts with media
    .orderBy(posts.createdAt);
    
  // Filter out SVG files locally since notLike isn't directly available
  const filteredPosts = postsWithMedia.filter(post => 
    post.mediaUrl && !post.mediaUrl.endsWith('.svg')
  );
  
  console.log(`Found ${filteredPosts.length} posts with media to check (excluding SVGs)`);
  
  // Statistics tracking
  let stats = {
    total: filteredPosts.length,
    oldFormat: 0,
    newFormat: 0,
    bothFormats: 0,
    noThumbnail: 0,
    oldFormatOnly: 0,
    newFormatOnly: 0,
    originalMissing: 0
  };
  
  // Check each post
  for (const post of filteredPosts) {
    if (!post.mediaUrl) continue;
    
    const filename = post.mediaUrl.split('/').pop() || '';
    const originalPath = path.join(uploadsDir, filename);
    const oldFormatThumbnailPath = path.join(thumbnailsDir, filename);
    const newFormatThumbnailPath = path.join(thumbnailsDir, `thumb-${filename}`);
    
    const isOldFormatImage = /^\d+-\d+-image\.\w+$/.test(filename);
    const createdAtStr = post.createdAt ? post.createdAt.toISOString() : 'unknown date';
    
    // Check what exists
    const originalExists = fs.existsSync(originalPath);
    const oldFormatExists = fs.existsSync(oldFormatThumbnailPath);
    const newFormatExists = fs.existsSync(newFormatThumbnailPath);
    
    console.log(`Post ID ${post.id} (${createdAtStr}) ${post.type}:`);
    console.log(`  - Filename: ${filename}`);
    console.log(`  - Is old format: ${isOldFormatImage}`);
    console.log(`  - Original exists: ${originalExists}`);
    console.log(`  - Old format thumbnail exists: ${oldFormatExists}`);
    console.log(`  - New format thumbnail exists: ${newFormatExists}`);
    
    // Update statistics
    if (!originalExists) {
      stats.originalMissing++;
    }
    
    if (oldFormatExists && newFormatExists) {
      stats.bothFormats++;
      console.log('  - BOTH thumbnail formats exist');
    } else if (oldFormatExists) {
      stats.oldFormatOnly++;
      stats.oldFormat++;
      console.log('  - ONLY old format thumbnail exists');
    } else if (newFormatExists) {
      stats.newFormatOnly++;
      stats.newFormat++;
      console.log('  - ONLY new format thumbnail exists');
    } else {
      stats.noThumbnail++;
      console.log('  - NO thumbnail exists in either format');
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Print statistics
  console.log('\nThumbnail Check Results:');
  console.log('=======================');
  console.log(`Total posts with media: ${stats.total}`);
  console.log(`Posts with both thumbnail formats: ${stats.bothFormats}`);
  console.log(`Posts with only old format thumbnails: ${stats.oldFormatOnly}`);
  console.log(`Posts with only new format thumbnails: ${stats.newFormatOnly}`);
  console.log(`Posts with no thumbnails: ${stats.noThumbnail}`);
  console.log(`Posts with missing original files: ${stats.originalMissing}`);
  
  console.log('\nBased on format availability:');
  console.log(`Old format thumbnails available: ${stats.oldFormat + stats.bothFormats}`);
  console.log(`New format thumbnails available: ${stats.newFormat + stats.bothFormats}`);
}

// For ESM compatibility, no automatic execution

export { checkThumbnails };