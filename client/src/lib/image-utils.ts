
/**
 * Get the thumbnail URL for an image
 */
export function getThumbnailUrl(originalUrl: string | null): string {
  if (!originalUrl || !originalUrl.startsWith('/uploads/')) {
    return originalUrl || '';
  }
  
  const filename = originalUrl.split('/').pop() || '';
  return `/uploads/thumbnails/${filename}`;
}

/**
 * Preload an image to ensure it's cached
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Optimize image loading for a list of posts
 * This will preload images for the visible posts and additional ones for smoother scrolling
 */
export function optimizeImageLoading(posts: any[], visibleCount: number = 10): void {
  // Preload thumbnails for visible posts first
  const visiblePosts = posts.slice(0, visibleCount);
  
  // Preload thumbnails immediately for visible posts
  visiblePosts.forEach(post => {
    if (post.imageUrl) {
      preloadImage(getThumbnailUrl(post.imageUrl)).catch(() => {
        // If thumbnail fails, try original
        preloadImage(post.imageUrl).catch(() => {
          console.error('Failed to preload image:', post.imageUrl);
        });
      });
    }
  });
  
  // Preload more aggressively - load next batch of images quickly
  const secondBatchCount = Math.min(posts.length - visibleCount, 15); // Load up to 15 more images quickly
  if (secondBatchCount > 0) {
    setTimeout(() => {
      posts.slice(visibleCount, visibleCount + secondBatchCount).forEach((post, index) => {
        if (post.imageUrl) {
          // Shorter delay between images
          setTimeout(() => {
            preloadImage(getThumbnailUrl(post.imageUrl)).catch(() => {
              preloadImage(post.imageUrl).catch(() => {});
            });
          }, index * 50); // Faster staggering
        }
      });
    }, 300); // Start sooner
  }
  
  // Then preload the rest with a longer delay
  const remainingPosts = posts.slice(visibleCount + secondBatchCount);
  if (remainingPosts.length > 0) {
    setTimeout(() => {
      remainingPosts.forEach((post, index) => {
        if (post.imageUrl) {
          setTimeout(() => {
            preloadImage(getThumbnailUrl(post.imageUrl)).catch(() => {});
          }, index * 75); // Still staggered but faster
        }
      });
    }, 800);
  }
}
