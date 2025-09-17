/**
 * Media Utils
 * This file provides utility functions for handling media files and URLs
 */

/**
 * Creates a direct download URL for Object Storage keys
 */
export function createDirectDownloadUrl(key: string | null): string {
  if (!key) return '';

  // Create Object Storage direct download URL
  return `/api/object-storage/direct-download?storageKey=${encodeURIComponent(key)}`;
}

/**
 * Creates a clean file URL from various input formats
 * This handles legacy URLs and converts them to the new Object Storage format
 */
export function createCleanFileUrl(url: string | null): string {
  if (!url) return '';

  console.log('createCleanFileUrl called with:', url);

  // Use the Object Storage utility function
  return createDirectDownloadUrl(url);
}

/**
 * Creates a thumbnail URL for media files
 * This is an alias for getVideoThumbnailUrl to maintain compatibility
 */
export function createThumbnailUrl(mediaUrl: string | null): string | null {
  const thumbnailUrl = getVideoThumbnailUrl(mediaUrl);
  return thumbnailUrl || '';
}

/**
 * Determines if a file is a video based on its extension or MIME type
 */
export function isVideoFile(filename: string | null): boolean {
  if (!filename) return false;

  const videoExtensions = ['.mov', '.mp4', '.avi', '.webm', '.m4v', '.3gp'];
  const lowerFilename = filename.toLowerCase();

  return videoExtensions.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Determines if a file is an image based on its extension or MIME type
 */
export function isImageFile(filename: string | null): boolean {
  if (!filename) return false;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const lowerFilename = filename.toLowerCase();

  return imageExtensions.some(ext => lowerFilename.endsWith(ext));
}

/**
 * Gets the appropriate thumbnail URL for a video file
 * For .mov files, looks for .mov.poster.jpg thumbnail
 * For other videos, creates a generic thumbnail URL
 */
export function getVideoThumbnailUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;

  try {
    // Extract filename from video URL
    let filename = '';
    if (mediaUrl.includes('storageKey=')) {
      const params = new URLSearchParams(mediaUrl.split('?')[1]);
      const storageKey = params.get('storageKey');
      if (storageKey) {
        filename = storageKey.split('/').pop() || '';
      }
    } else {
      filename = mediaUrl.split('/').pop() || '';
    }

    if (!filename) return null;

    // Create thumbnail filename (replace video extension with .jpg)
    const baseName = filename.substring(0, filename.lastIndexOf('.'));
    const thumbnailFilename = `${baseName}.jpg`;

    // Return thumbnail URL using Object Storage
    return createDirectDownloadUrl(`shared/uploads/${thumbnailFilename}`);
  } catch (error) {
    console.error('Error generating video thumbnail URL:', error);
    return null;
  }
}

/**
 * Creates a poster/thumbnail URL for video files
 * This is specifically for .mov files that have .poster.jpg thumbnails
 */
export function createPosterUrl(videoUrl: string | null): string | null {
  return getVideoThumbnailUrl(videoUrl);
}

/**
 * Checks if a URL is a video file based on its extension
 */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.flv', '.wmv'];
  const cleanUrl = url.split('?')[0].toLowerCase();
  return videoExtensions.some(ext => cleanUrl.endsWith(ext));
}

/**
 * Creates a media URL for display (alias for createDirectDownloadUrl)
 */
export function createMediaUrl(key: string | null): string {
  return createDirectDownloadUrl(key);
}