
import { createDirectDownloadUrl } from './object-storage-utils';

/**
 * Creates a clean media URL for displaying files
 * @param mediaUrl The raw media URL from the database
 * @returns Clean URL for displaying media
 */
export function createMediaUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';
  
  console.log('createMediaUrl called with:', mediaUrl);
  
  // Extract filename from various URL formats
  let filename = '';
  
  if (mediaUrl.includes('filename=')) {
    // Handle /api/serve-file?filename=... format
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    filename = urlParams.get('filename') || '';
  } else if (mediaUrl.includes('storageKey=')) {
    // Handle Object Storage URL format
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const storageKey = urlParams.get('storageKey') || '';
    filename = storageKey.split('/').pop() || '';
  } else if (mediaUrl.startsWith('shared/uploads/')) {
    // Direct storage key format
    filename = mediaUrl.split('/').pop() || '';
  } else {
    // Direct filename or path
    filename = mediaUrl.split('/').pop() || mediaUrl;
  }
  
  console.log('Cleaned filename:', filename);
  
  // Create Object Storage URL
  const cleanUrl = createDirectDownloadUrl(`shared/uploads/${filename}`);
  
  // Add cache buster to prevent stale images
  const cacheBuster = Date.now();
  const separator = cleanUrl.includes('?') ? '&' : '?';
  const finalUrl = `${cleanUrl}${separator}_cb=${cacheBuster}`;
  
  console.log('Created clean media URL:', finalUrl);
  return finalUrl;
}

/**
 * Creates a simplified poster URL for video thumbnails
 * @param mediaUrl The media URL to create a poster for
 * @returns URL for the video poster/thumbnail
 */
export function createSimplifiedPosterUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';
  
  console.log('createSimplifiedPosterUrl called with:', mediaUrl);
  
  // Extract base filename without extension
  let baseFilename = '';
  
  if (mediaUrl.includes('filename=')) {
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const filename = urlParams.get('filename') || '';
    baseFilename = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  } else if (mediaUrl.includes('storageKey=')) {
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const storageKey = urlParams.get('storageKey') || '';
    const filename = storageKey.split('/').pop() || '';
    baseFilename = filename.replace(/\.[^/.]+$/, '');
  } else {
    const filename = mediaUrl.split('/').pop() || mediaUrl;
    baseFilename = filename.replace(/\.[^/.]+$/, '');
  }
  
  // Create thumbnail filename with .jpg extension
  const thumbnailFilename = `${baseFilename}.jpg`;
  
  // Check if the URL already has the correct JPG format
  if (mediaUrl.includes(`${thumbnailFilename}`)) {
    console.log('Video player: URL already has correct JPG format:', mediaUrl);
    return createDirectDownloadUrl(`shared/uploads/${thumbnailFilename}`);
  }
  
  console.log('Video player: Converting to JPG thumbnail:', thumbnailFilename);
  return createDirectDownloadUrl(`shared/uploads/${thumbnailFilename}`);
}

/**
 * Checks if a URL is a video based on the file extension
 * @param url The URL to check
 * @returns true if the URL appears to be a video
 */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
  const lowerUrl = url.toLowerCase();
  
  return videoExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * Gets the file extension from a URL
 * @param url The URL to extract extension from
 * @returns The file extension (with dot) or empty string
 */
export function getFileExtension(url: string): string {
  if (!url) return '';
  
  const filename = url.split('/').pop() || '';
  const match = filename.match(/\.[^.]*$/);
  return match ? match[0] : '';
}

/**
 * Creates a cache-busted URL
 * @param url The base URL
 * @returns URL with cache buster parameter
 */
export function addCacheBuster(url: string): string {
  if (!url) return '';
  
  const cacheBuster = Date.now();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_cb=${cacheBuster}`;
}

/**
 * Creates a thumbnail URL (alias for createSimplifiedPosterUrl)
 * @param mediaUrl The media URL to create a thumbnail for
 * @returns URL for the thumbnail
 */
export function createThumbnailUrl(mediaUrl: string | null): string {
  return createSimplifiedPosterUrl(mediaUrl);
}
