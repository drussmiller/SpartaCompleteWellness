
/**
 * Constants for cross-environment image handling
 */
export const PROD_URL = 'https://sparta-faith.replit.app';
let cachedFileStatus: Record<string, boolean> = {};

/**
 * Media Service to handle cross-environment image loading
 * This ensures images work in both development and production
 * 
 * This integrates with the server-side SpartaObjectStorage to provide
 * consistent media access across environments
 */
class MediaService {
  private prodUrl: string;
  private localServerUrl: string;
  private cachedResults: Record<string, string> = {};
  private cachedLocalChecks: Record<string, boolean> = {};
  
  constructor(productionUrl: string) {
    this.prodUrl = productionUrl;
    // Local server URL is based on current window location
    this.localServerUrl = window.location.origin;
  }

  /**
   * Gets the proper URL for an image, handles cross-environment compatibility
   * Always tries production URL first since that's where our actual images are
   */
  getImageUrl(path: string | null): string {
    if (!path) return generateImagePlaceholder('No image available');
    
    // If path is already a full URL or data URI, return it as is
    if (path.startsWith('http') || path.startsWith('data:')) {
      return path;
    }
    
    // If we've already processed this path, return the cached result
    if (this.cachedResults[path]) {
      return this.cachedResults[path];
    }
    
    // Normalize the path (remove any leading slash)
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // First try using the server-side object storage if available
    // by using a relative URL that will go through the local server's getFileUrl method
    if (this.cachedLocalChecks[path] === true) {
      // We've previously confirmed this exists locally
      const result = `${normalizedPath}`;
      this.cachedResults[path] = result;
      return result;
    }
    
    // Default to production URL for stability
    const result = `${this.prodUrl}${normalizedPath}`;
    
    // Try to check if this file exists locally
    this.checkImageExistsLocally(normalizedPath).then(exists => {
      if (exists) {
        // Update cache for future calls
        this.cachedLocalChecks[path] = true;
      }
    }).catch(() => {
      // If error, assume it doesn't exist locally
      this.cachedLocalChecks[path] = false; 
    });
    
    // Cache the result
    this.cachedResults[path] = result;
    return result;
  }
  
  /**
   * Attempt to check if an image exists locally by making a HEAD request
   */
  private async checkImageExistsLocally(path: string): Promise<boolean> {
    try {
      const response = await fetch(path, {
        method: 'HEAD',
        headers: {
          // Add cache control to ensure we're not getting cached responses
          'Cache-Control': 'no-cache'
        }
      });
      return response.ok;
    } catch (error) {
      console.warn(`Failed to check if image exists locally: ${path}`, error);
      return false;
    }
  }
  
  /**
   * Gets a URL for a thumbnail of the given media
   */
  getThumbnailUrl(originalPath: string | null, size: 'small' | 'medium' = 'small'): string {
    if (!originalPath) return generateImagePlaceholder('No thumbnail');
    
    // If it's a data URI or already a thumbnail URL, return as is
    if (originalPath.startsWith('data:')) {
      return originalPath;
    }
    
    const basePath = originalPath.startsWith('http') ? 
      new URL(originalPath).pathname : originalPath;
      
    // Extract the filename from the path
    const filename = basePath.split('/').pop() || '';
    
    // Create the thumbnail path using the server's convention (thumb-{filename})
    const thumbnailFilename = `thumb-${filename}`;
    const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
    
    // Use the getImageUrl method to handle the environment specifics
    return this.getImageUrl(thumbnailPath);
  }
  
  /**
   * Get a URL for a video poster image
   */
  getVideoPosterUrl(videoPath: string | null): string {
    if (!videoPath) return generateImagePlaceholder('Video'); 
    
    // Get the appropriate thumbnail
    return this.getThumbnailUrl(videoPath);
  }
}

// Create a singleton instance
export const mediaService = new MediaService(PROD_URL);

/**
 * Gets a thumbnail URL for an image or creates a default SVG placeholder
 * 
 * @param originalUrl - The original URL of the image or video
 * @param size - The desired thumbnail size
 * @param tryRemote - Whether to try remote URLs if local ones fail
 * @returns The URL of the appropriate thumbnail or a placeholder SVG
 */
export function getThumbnailUrl(
  originalUrl: string | null, 
  size: 'small' | 'medium' | 'large' = 'medium',
  tryRemote: boolean = true
): string {
  if (!originalUrl) {
    // Return a simple data URI SVG placeholder instead of empty string
    return generateImagePlaceholder('No image available');
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
      
      // Generate local thumbnail path
      const localThumbPath = isOldFormatImage
        ? `/uploads/thumbnails/${filename}`
        : `/uploads/thumbnails/thumb-${filename}`;
        
      // Check cache to see if we know this file exists locally
      const cacheKey = `thumb:${localThumbPath}`;
      if (cachedFileStatus[cacheKey] === false && tryRemote) {
        // If we know it's missing locally, go straight to production URL
        return `${PROD_URL}${localThumbPath}`;
      }
      
      // Return the local thumbnail path - we'll handle fallbacks in the image component
      return localThumbPath;
    } else {
      // For medium/large sizes, check if we know the original is missing
      const cacheKey = `orig:${originalUrl}`;
      if (cachedFileStatus[cacheKey] === false && tryRemote) {
        // If we know it's missing locally, go straight to production URL
        return `${PROD_URL}${originalUrl}`;
      }
      
      // Return the original URL - we'll handle fallbacks in the image component
      return originalUrl;
    }
  }
  
  // For any other URLs, return as is
  return originalUrl;
}

/**
 * Generates a data URI for an SVG placeholder image with customizable text
 * 
 * @param text - Text to display in the placeholder
 * @returns - Data URI for an SVG image
 */
export function generateImagePlaceholder(text: string = 'Image'): string {
  // Use consistent brand colors for placeholders
  const bgColor = '#f0f0f0';
  const textColor = '#888888';
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <text x="50%" y="50%" fill="${textColor}" font-family="Arial, sans-serif" font-size="16" 
        text-anchor="middle" dominant-baseline="middle">${text}</text>
    </svg>
  `.trim();
  
  // Convert to a data URI
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
    
  return `data:image/svg+xml;charset=UTF-8,${encoded}`;
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
