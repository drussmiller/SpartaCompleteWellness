
import { createDirectDownloadUrl } from './object-storage-utils';

/**
 * Production server URL for cross-environment access
 */
export const PROD_URL = "https://sparta.replit.app";

/**
 * Get an image URL with direct Object Storage access
 * This is used for most media files in the app
 * @param originalUrl The original URL of the image
 * @returns A URL that works with Object Storage
 */
export function getImageUrl(originalUrl: string | null): string {
  if (!originalUrl) {
    return '';
  }
  
  // Handle SVG files directly
  if (originalUrl.endsWith('.svg')) {
    return originalUrl;
  }
  
  // Handle absolute external URLs (like https://example.com/image.jpg)
  if (originalUrl.startsWith('http') && !originalUrl.includes('sparta.replit.app')) {
    return originalUrl;
  }
  
  // Convert uploads/ paths to shared/uploads/ for consistency
  if (originalUrl.startsWith('/uploads/') && !originalUrl.startsWith('/shared/')) {
    const sharedPath = `/shared${originalUrl}`;
    return createDirectDownloadUrl(sharedPath);
  }
  
  // Handle production URLs by converting to local shared paths
  if (originalUrl.startsWith('https://sparta.replit.app/')) {
    // Convert to local path for direct access
    let localPath = originalUrl.replace('https://sparta.replit.app', '');
    
    // Ensure it uses shared paths for uploads
    if (localPath.startsWith('/uploads/') && !localPath.startsWith('/shared/')) {
      localPath = `/shared${localPath}`;
    }
    
    return createDirectDownloadUrl(localPath);
  }
  
  // For local paths, use direct Object Storage access
  if (originalUrl.startsWith('/')) {
    return createDirectDownloadUrl(originalUrl);
  }
  
  // For any other format, return as is
  return originalUrl;
}

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
  
  // Handle shared uploads path - keep it as shared
  if (originalUrl.startsWith('/shared/uploads/')) {
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
      const posterPath = `/shared/uploads/${baseName}.poster.jpg`;
      
      // For thumbnails, try both with and without the thumb- prefix
      const thumbFilename = `thumb-${filename}`;
      const normalThumbPath = `/shared/uploads/thumbnails/${filename}`;
      const prefixedThumbPath = `/shared/uploads/thumbnails/${thumbFilename}`;
      
      // Return in order of preference: poster image, thumbs, or original
      if (size === 'medium' || size === 'large') {
        // For medium/large, prioritize the poster image since it's higher quality
        return createDirectDownloadUrl(posterPath);
      } else if (size === 'small') {
        // For small, try thumbnail first, then poster
        return createDirectDownloadUrl(prefixedThumbPath);
      } else {
        // Default fallback
        return createDirectDownloadUrl(posterPath);
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
        return createDirectDownloadUrl(`/shared/uploads/thumbnails/${filename}`);
      } else {
        // New format - with "thumb-" prefix
        return createDirectDownloadUrl(`/shared/uploads/thumbnails/thumb-${filename}`);
      }
    } else {
      // For medium/large sizes or when size isn't specified, use original
      return createDirectDownloadUrl(originalUrl);
    }
  }
  
  // Handle direct URLs from production
  if (originalUrl.startsWith('https://sparta.replit.app/')) {
    // Convert to local path for thumbnail generation
    let localPath = originalUrl.replace('https://sparta.replit.app', '');
    
    // Ensure we use shared paths for uploads
    if (localPath.startsWith('/uploads/') && !localPath.startsWith('/shared/')) {
      localPath = `/shared${localPath}`;
    }
    
    return getThumbnailUrl(localPath, size);
  }
  
  // Handle regular images that need thumbnailing
  if (originalUrl.startsWith('/uploads/')) {
    // Convert uploads to shared/uploads - this is the new standard
    const sharedUrl = `/shared${originalUrl}`;
    return getThumbnailUrl(sharedUrl, size);
  }
  
  // For any other URLs, check if it's a relative path that needs direct download
  if (originalUrl.startsWith('/')) {
    return createDirectDownloadUrl(originalUrl);
  }
  
  // For absolute URLs (external), return as is
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
 * This function now always returns an empty string to never show generic placeholders
 * as requested by the user
 */
export function getFallbackImageUrl(postType: string): string {
  // Always return empty string to avoid showing generic placeholders
  // This will cause the UI to hide the image container rather than showing a generic one
  return '';
}

/**
 * Check if an image exists locally
 * This is used to validate if a fallback is needed
 */
export function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    // For SVG files and non-uploads/non-shared paths, assume they exist
    if (url.endsWith('.svg') || 
        (!url.startsWith('/uploads/') && 
         !url.startsWith('/shared/uploads/') && 
         !url.includes('sparta.replit.app'))) {
      resolve(true);
      return;
    }
    
    // Try the provided URL first using a more reliable GET method instead of HEAD
    // HEAD requests may be rejected by some servers or may not properly check existence
    const checkUrl = (testUrl: string): Promise<boolean> => {
      return fetch(testUrl, { 
        method: 'GET', 
        headers: { 'Range': 'bytes=0-0' }, // Only request the first byte to minimize bandwidth
        cache: 'no-store' // Avoid caching to get fresh results
      })
        .then(response => {
          // Don't log, just return the status
          return response.ok || response.status === 206; // 206 is Partial Content, which is success for Range request
        })
        .catch(() => {
          // Silently fail - no logs
          return false;
        });
    };
    
    // Check using direct Object Storage download route
    const checkViaObjectStorageRoute = (originalUrl: string): Promise<boolean> => {
      // Normalize URL to get the path
      let path = originalUrl;
      
      // Handle production URLs
      if (path.startsWith('https://sparta.replit.app')) {
        path = path.replace('https://sparta.replit.app', '');
      }
      
      // Create the direct download URL
      const directUrl = createDirectDownloadUrl(path);
      
      // Try the direct download URL
      return fetch(directUrl, { 
        method: 'GET', 
        headers: { 'Range': 'bytes=0-0' }, // Only request the first byte to minimize bandwidth 
        cache: 'no-store' // Avoid caching to get fresh results
      })
        .then(response => {
          // Silent success
          return response.ok || response.status === 206; // 206 is Partial Content, which is success for Range request
        })
        .catch(() => {
          // Silent fail
          return false;
        });
    };
    
    // Get all possible paths to try based on the URL
    const getPathVariations = (baseUrl: string): string[] => {
      // Normalize URL
      let normalizedUrl = baseUrl;
      
      // Handle production URLs
      if (normalizedUrl.startsWith('https://sparta.replit.app')) {
        normalizedUrl = normalizedUrl.replace('https://sparta.replit.app', '');
      }
      
      const variations = [baseUrl]; // Original URL is first to try
      
      // Generate all possible variants
      if (normalizedUrl.startsWith('/uploads/')) {
        // Regular path - add shared version
        const sharedPath = normalizedUrl.replace('/uploads/', '/shared/uploads/');
        variations.push(sharedPath);
        
        // Add production versions
        variations.push(`${PROD_URL}${normalizedUrl}`);
        variations.push(`${PROD_URL}${sharedPath}`);
      } 
      else if (normalizedUrl.startsWith('/shared/uploads/')) {
        // Shared path - add regular version
        const regularPath = normalizedUrl.replace('/shared/uploads/', '/uploads/');
        variations.push(regularPath);
        
        // Add production versions
        variations.push(`${PROD_URL}${normalizedUrl}`);
        variations.push(`${PROD_URL}${regularPath}`);
      }
      
      // Return unique paths only
      return Array.from(new Set(variations));
    };
    
    // Try all path variations in sequence
    const tryPaths = async () => {
      // First try the direct Object Storage approach
      const existsInObjectStorage = await checkViaObjectStorageRoute(url);
      if (existsInObjectStorage) {
        // Image exists
        resolve(true);
        return;
      }
      
      // Get all possible paths to try
      const paths = getPathVariations(url);
      
      // Try each path in sequence
      for (const path of paths) {
        const exists = await checkUrl(path);
        if (exists) {
          resolve(true);
          return;
        }
      }
      
      // No path worked, resolve false
      resolve(false);
    };
    
    // Start the cascade check
    tryPaths();
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
          // Silent failure - no logging
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
              // Silent failure for non-visible posts - no fallback images
            });
          });
        }, index * 100);
      }
    });
  }, 1000);
}
