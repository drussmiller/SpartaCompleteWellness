// Regular expression for detecting URLs
const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

export function convertUrlsToLinks(text: string): string {
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${url}</a>`;
  });
}

/**
 * Helper function to extract filename from URL or path
 */
function getFilenameFromUrl(url: string): string {
  // Handle direct download URLs
  if (url.includes('/api/object-storage/direct-download')) {
    const match = url.match(/fileUrl=([^&]+)/);
    if (match) {
      const decodedUrl = decodeURIComponent(match[1]);
      return decodedUrl.split('/').pop() || '';
    }
  }

  // Handle regular paths
  return url.split('/').pop() || '';
}

/**
 * Helper function to check if a file is a video
 */
function isVideoFile(url: string): boolean {
  const filename = getFilenameFromUrl(url);
  const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
  return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * Get the thumbnail URL for a given media URL
 * This function handles different file types and generates appropriate thumbnail URLs
 */
export function getThumbnailUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';

  // If it's already a full URL (starts with http), handle it differently
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    return mediaUrl; // Return the original URL for external images
  }

  // Import the createDirectDownloadUrl function
  const { createDirectDownloadUrl } = require('./object-storage-utils');

  // For videos, we want to get the thumbnail, not the video itself
  if (isVideoFile(mediaUrl)) {
    // Extract filename and create thumbnail path
    const filename = getFilenameFromUrl(mediaUrl);
    const baseFilename = filename.substring(0, filename.lastIndexOf('.')) || filename;

    // For MOV files, prioritize .poster.jpg thumbnails
    if (filename.toLowerCase().endsWith('.mov')) {
      return createDirectDownloadUrl(`thumbnails/${baseFilename}.poster.jpg`);
    }

    // For other videos, use standard thumbnail naming
    return createDirectDownloadUrl(`thumbnails/thumb-${filename}.jpg`);
  }

  // For images, create a thumbnail version
  const filename = getFilenameFromUrl(mediaUrl);
  return createDirectDownloadUrl(`thumbnails/thumb-${filename}`);
}

/**
 * Creates a clean URL for accessing files from Object Storage
 * This function handles various URL formats and ensures proper routing
 */
export function createCleanFileUrl(url: string | null): string {
  if (!url) return '';

  // If this is already a complete direct download URL, return as-is
  if (url.startsWith('/api/object-storage/direct-download')) {
    return url;
  }

  // If this is a full URL (starts with http), return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Extract the actual file path from any existing nested URLs
  let cleanPath = url;

  // Handle nested direct-download URLs - extract the innermost fileUrl
  while (cleanPath.includes('direct-download?fileUrl=')) {
    const match = cleanPath.match(/fileUrl=([^&]+)/);
    if (match) {
      cleanPath = decodeURIComponent(match[1]);
    } else {
      break;
    }
  }

  // Handle other nested patterns
  while (cleanPath.includes('?fileUrl=')) {
    const match = cleanPath.match(/fileUrl=([^&]+)/);
    if (match) {
      cleanPath = decodeURIComponent(match[1]);
    } else {
      break;
    }
  }

  // Remove any leading slash
  cleanPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;

  // Clean up any duplicate path segments
  cleanPath = cleanPath.replace(/^(shared\/)+/, 'shared/');
  cleanPath = cleanPath.replace(/^(uploads\/)+/, 'uploads/');
  cleanPath = cleanPath.replace(/^(thumbnails\/)+/, 'thumbnails/');

  // Ensure proper shared path structure
  if (!cleanPath.startsWith('shared/')) {
    if (cleanPath.startsWith('uploads/')) {
      cleanPath = `shared/${cleanPath}`;
    } else if (cleanPath.startsWith('thumbnails/')) {
      cleanPath = `shared/uploads/${cleanPath}`;
    } else {
      cleanPath = `shared/uploads/${cleanPath}`;
    }
  }

  // Return the clean URL
  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanPath)}`;
}