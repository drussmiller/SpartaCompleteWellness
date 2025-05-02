
/**
 * Get the thumbnail URL for an image with size optimization
 */
export function getThumbnailUrl(originalUrl: string | null, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!originalUrl) {
    return '';
  }
  
  // Handle SVG files - use them directly without thumbnailing
  if (originalUrl.endsWith('.svg')) {
    return originalUrl;
  }
  
  // Handle regular images that need thumbnailing
  if (originalUrl.startsWith('/uploads/')) {
    const filename = originalUrl.split('/').pop() || '';
    
    // Check if this is a special video type (memory verse or miscellaneous)
    const isMemoryVerse = filename.toLowerCase().includes('memory_verse');
    const isMiscellaneousVideo = filename.toLowerCase().includes('miscellaneous');
    
    // Handle video files differently
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const isVideoExtension = videoExtensions.some(ext => originalUrl.toLowerCase().endsWith(ext));
    const isVideo = isVideoExtension || isMemoryVerse || isMiscellaneousVideo;
    
    // For videos, check for poster image first, then thumbnails
    if (isVideo) {
      // First try looking for a poster image (most reliable)
      const baseName = filename.substring(0, filename.lastIndexOf('.'));
      const posterPath = `/uploads/${baseName}.poster.jpg`;
      
      // For thumbnails, try both with and without the thumb- prefix
      const thumbFilename = `thumb-${filename}`;
      const normalThumbPath = `/uploads/thumbnails/${filename}`;
      const prefixedThumbPath = `/uploads/thumbnails/${thumbFilename}`;
      
      // Return in order of preference: poster image, thumbs, or original
      if (size === 'medium' || size === 'large') {
        // For medium/large, prioritize the poster image since it's higher quality
        return posterPath;
      } else if (size === 'small') {
        // For small, try thumbnail first, then poster
        return prefixedThumbPath;
      } else {
        // Default fallback
        return posterPath;
      }
    }
    
    // For regular images
    if (size === 'small') {
      // Check if this is an older image (before April 2025) or a newer one
      // Older image format: 1742695590858-649008714-image.jpeg (uses timestamp-random-name format)
      // Newer image format: 1743773848580-c2def441.jpeg (uses timestamp-hash format)
      
      const isOldFormatImage = /^\d+-\d+-image\.\w+$/.test(filename);
      
      if (isOldFormatImage) {
        // Old format - no "thumb-" prefix
        return `/uploads/thumbnails/${filename}`;
      } else {
        // New format - with "thumb-" prefix
        return `/uploads/thumbnails/thumb-${filename}`;
      }
    } else {
      // For medium/large sizes or when size isn't specified, use original
      return originalUrl;
    }
  }
  
  // For any other URLs, return as is
  return originalUrl;
}

/**
 * Check if image is in viewport for lazy loading
 */
export function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Get a fallback image URL
 * This will return a generic image URL for different post types
 */
export function getFallbackImageUrl(postType: string): string {
  let type = postType;
  
  // Normalize type (in case we get variations)
  if (type === 'memory_verse' || type === 'verse') {
    type = 'verse';
  } else if (type === 'miscellaneous') {
    type = 'post'; // Use post fallback for miscellaneous
  } else if (!['food', 'workout', 'scripture'].includes(type)) {
    type = 'post'; // Default fallback for any unrecognized type
  }
  
  // Return the appropriate SVG
  return `/uploads/default-${type}.svg`;
}

/**
 * Check if an image exists locally
 * This is used to validate if a fallback is needed
 */
export function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    // For SVG files and non-uploads, assume they exist
    if (url.endsWith('.svg') || !url.startsWith('/uploads/')) {
      resolve(true);
      return;
    }
    
    // For regular images, do a HEAD request
    fetch(url, { method: 'HEAD' })
      .then(response => resolve(response.ok))
      .catch(() => resolve(false));
  });
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
    if (post.mediaUrl) {
      preloadImage(getThumbnailUrl(post.mediaUrl)).catch(() => {
        // If thumbnail fails, try original
        preloadImage(post.mediaUrl).catch(() => {
          // If original fails, try the fallback
          if (post.type) {
            preloadImage(getFallbackImageUrl(post.type)).catch(() => {
              console.error('Failed to preload all image options:', post.mediaUrl);
            });
          } else {
            console.error('Failed to preload image:', post.mediaUrl);
          }
        });
      });
    }
  });
  
  // Then preload the rest with a delay to not block the UI
  setTimeout(() => {
    posts.slice(visibleCount).forEach((post, index) => {
      if (post.mediaUrl) {
        // Stagger loading to prevent network congestion
        setTimeout(() => {
          preloadImage(getThumbnailUrl(post.mediaUrl)).catch(() => {
            // Try original next
            preloadImage(post.mediaUrl).catch(() => {
              // Silently try the fallback
              if (post.type) {
                preloadImage(getFallbackImageUrl(post.type)).catch(() => {
                  // Silent failure for non-visible posts
                });
              }
            });
          });
        }, index * 100);
      }
    });
  }, 1000);
}
