
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
 * This will preload images for the visible posts
 */
export function optimizeImageLoading(posts: any[], visibleCount: number = 5): void {
  // Preload thumbnails for visible posts first
  const visiblePosts = posts.slice(0, visibleCount);
  
  // Preload thumbnails immediately
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
  
  // Then preload the rest with a delay to not block the UI
  setTimeout(() => {
    posts.slice(visibleCount).forEach((post, index) => {
      if (post.imageUrl) {
        // Stagger loading to prevent network congestion
        setTimeout(() => {
          preloadImage(getThumbnailUrl(post.imageUrl)).catch(() => {
            // Silent failure for non-visible posts
          });
        }, index * 100);
      }
    });
  }, 1000);
}
