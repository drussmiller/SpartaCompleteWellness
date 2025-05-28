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

  // If it's already a direct download URL, return as-is to prevent nesting
  if (mediaUrl.includes('/api/object-storage/direct-download')) {
    return mediaUrl;
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
      return createDirectDownloadUrl(`shared/uploads/thumbnails/${baseFilename}.poster.jpg`);
    }

    // For other videos, use standard thumbnail naming
    return createDirectDownloadUrl(`shared/uploads/thumbnails/thumb-${filename}.jpg`);
  }

  // For images, create a thumbnail version
  const filename = getFilenameFromUrl(mediaUrl);
  return createDirectDownloadUrl(`shared/uploads/thumbnails/thumb-${filename}`);
}