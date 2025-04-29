
import { db } from "./db";
import { posts } from "@shared/schema";
import { logger } from "./logger";
import fs from 'fs';
import path from 'path';

export async function auditMissingImages() {
  try {
    // Get all posts with media URLs
    const postsWithMedia = await db
      .select({
        id: posts.id,
        mediaUrl: posts.mediaUrl,
        userId: posts.userId,
        type: posts.type,
        createdAt: posts.createdAt
      })
      .from(posts)
      .where(db.sql`${posts.mediaUrl} IS NOT NULL`);

    const uploadsDir = path.join(process.cwd(), 'uploads');
    let missingFiles = [];

    for (const post of postsWithMedia) {
      if (!post.mediaUrl) continue;
      
      const filename = path.basename(post.mediaUrl);
      const filePath = path.join(uploadsDir, filename);
      
      if (!fs.existsSync(filePath)) {
        missingFiles.push({
          postId: post.id,
          userId: post.userId,
          mediaUrl: post.mediaUrl,
          createdAt: post.createdAt
        });
      }
    }

    logger.info(`Found ${missingFiles.length} posts with missing media files`);
    console.log('\nMissing Files Report:');
    console.table(missingFiles);

    return missingFiles;
  } catch (error) {
    logger.error('Error during image audit:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  auditMissingImages()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
