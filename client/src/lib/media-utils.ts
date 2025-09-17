/**
 * Media Utils
 * This file provides utility functions for handling media files and URLs
 */

import { createDirectDownloadUrl } from './object-storage-utils';

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
  return getVideoThumbnailUrl(mediaUrl);
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

  console.log('getVideoThumbnailUrl called with:', mediaUrl);

  // Extract the base filename from the media URL
  let baseFilename: string;

  if (mediaUrl.includes('storageKey=')) {
    // Extract from Object Storage URL format
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const storageKey = urlParams.get('storageKey');
    if (!storageKey) return null;

    // Get just the filename from the storage key
    baseFilename = storageKey.split('/').pop() || storageKey;
  } else if (mediaUrl.includes('/')) {
    // Extract filename from path
    baseFilename = mediaUrl.split('/').pop() || mediaUrl;
  } else {
    baseFilename = mediaUrl;
  }

  console.log('Extracted base filename:', baseFilename);

  // For .mov files, create thumbnail URL
  if (baseFilename.toLowerCase().endsWith('.mov')) {
    const thumbnailFilename = `${baseFilename}.poster.jpg`;
    console.log('Creating thumbnail URL for MOV file:', thumbnailFilename);

    // Use Object Storage format for thumbnail
    const thumbnailStorageKey = `shared/uploads/${thumbnailFilename}`;
    const thumbnailUrl = `/api/object-storage/direct-download?storageKey=${encodeURIComponent(thumbnailStorageKey)}`;

    console.log('Generated thumbnail URL:', thumbnailUrl);
    return thumbnailUrl;
  }

  // For other video types, we might not have thumbnails yet
  return null;
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

/**
 * Creates a thumbnail URL for videos
 */
export function createThumbnailUrl(videoUrl: string | null): string {
  if (!videoUrl) return '';

  // Extract filename from video URL
  let filename = '';
  if (videoUrl.includes('storageKey=')) {
    const params = new URLSearchParams(videoUrl.split('?')[1]);
    const storageKey = params.get('storageKey');
    if (storageKey) {
      filename = storageKey.split('/').pop() || '';
    }
  } else {
    filename = videoUrl.split('/').pop() || '';
  }

  if (!filename) return '';

  // Create thumbnail filename (replace video extension with .jpg)
  const baseName = filename.substring(0, filename.lastIndexOf('.'));
  const thumbnailFilename = `${baseName}.jpg`;

  // Return thumbnail URL using Object Storage
  return createDirectDownloadUrl(`shared/uploads/${thumbnailFilename}`);
}