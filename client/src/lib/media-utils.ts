/**
 * Simple Media URL Utilities
 * 
 * This module provides clean, simple media URL handling without recursive patterns.
 */

import { createDirectDownloadUrl } from './object-storage-utils';

/**
 * Extracts a clean filename from any URL or path
 */
function extractCleanFilename(input: string): string | null {
  if (!input) return null;

  // If it's a base64 data URL, return null (should be handled separately)
  if (input.startsWith('data:')) return null;

  // Remove any query parameters first
  const withoutQuery = input.split('?')[0];

  // Split by slashes and find the last part that looks like a filename
  const parts = withoutQuery.split('/');

  // Look for a part that has a file extension or looks like our filename pattern
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && 
        (part.includes('.') || part.match(/^\d+[-_][a-f0-9]+/)) && 
        !part.includes('direct-download') && 
        !part.includes('fileUrl')) {
      return part;
    }
  }

  return null;
}

/**
 * Creates a simple, clean media URL with fallback priority
 */
export function createMediaUrl(originalUrl: string | null): string {
  if (!originalUrl) {
    console.log('❌ createMediaUrl: No originalUrl provided');
    return '';
  }

  console.log('🔧 createMediaUrl called with:', originalUrl);

  // Handle data URLs (base64 images)
  if (originalUrl.startsWith('data:')) {
    console.log('✅ Data URL detected, returning as-is');
    return originalUrl;
  }

  // Handle direct download URLs (new Object Storage format)
  if (originalUrl.includes('/api/object-storage/direct-download')) {
    console.log('✅ Object Storage direct download URL detected, returning as-is');
    return originalUrl;
  }

  // Handle serve-file URLs (legacy format)
  if (originalUrl.includes('/api/serve-file')) {
    console.log('✅ Serve-file URL detected, returning as-is');
    return originalUrl;
  }

  // Handle full URLs (external)
  if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
    console.log('✅ Full URL detected, returning as-is');
    return originalUrl;
  }

  // For storage keys or relative paths, create Object Storage URL
  console.log('🔧 Creating Object Storage URL for:', originalUrl);
  const result = createDirectDownloadUrl(originalUrl);
  console.log('✅ createMediaUrl final result:', result);
  return result;
}

/**
 * Creates a thumbnail URL for a given media file
 */
export function createThumbnailUrl(mediaUrl: string): string | null {
  if (!mediaUrl) return null;

  console.log('createThumbnailUrl called with:', mediaUrl);

  // Check if this is already a thumbnail URL
  if (mediaUrl.includes('direct-download') && (mediaUrl.includes('.jpeg') || mediaUrl.includes('.jpg'))) {
    console.log('Already a thumbnail URL, returning as-is');
    return mediaUrl;
  }

  // If this is a serve-file URL, extract the filename
  if (mediaUrl.includes('/api/serve-file') && mediaUrl.includes('filename=')) {
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const filename = urlParams.get('filename');
    if (filename) {
      console.log('Extracted filename from serve-file URL:', filename);

      // Create thumbnail filename - use .jpg extension (not .jpeg)
      const baseFilename = filename.replace(/\.(mov|mp4|webm|avi|mkv)$/i, '');

      // Use .jpg extension for thumbnails (this is what our thumbnail generation creates)
      const jpgThumbnail = `/api/object-storage/direct-download?storageKey=${encodeURIComponent(`shared/uploads/${baseFilename}.jpg`)}`;
      console.log('Created .jpg thumbnail URL:', jpgThumbnail);
      return jpgThumbnail;
    }
  }

  // Extract filename from various URL formats
  let filename = '';

  if (mediaUrl.includes('/api/object-storage/direct-download')) {
    // Extract from Object Storage URL
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1] || '');
    const storageKey = urlParams.get('storageKey');
    if (storageKey) {
      filename = storageKey.split('/').pop() || '';
    }
  } else {
    // Extract from regular path
    filename = mediaUrl.split('/').pop() || '';
    filename = filename.split('?')[0]; // Remove query parameters
  }

  if (!filename) {
    console.log('No filename found, returning null');
    return null;
  }

  console.log('Extracted filename:', filename);

  // Replace video extension with .jpg for thumbnail
  const baseFilename = filename.replace(/\.(mov|mp4|webm|avi|mkv)$/i, '');
  const thumbnailFilename = `${baseFilename}.jpg`;
  console.log('Generated thumbnail filename:', thumbnailFilename);

  // Create Object Storage URL for thumbnail
  const storageKey = `shared/uploads/${thumbnailFilename}`;
  const result = `/api/object-storage/direct-download?storageKey=${encodeURIComponent(storageKey)}`;
  console.log('📸 THUMBNAIL GENERATION DEBUG:');
  console.log('📸 Original mediaUrl:', mediaUrl);
  console.log('📸 Extracted filename:', filename);
  console.log('📸 Base filename (no extension):', baseFilename);
  console.log('📸 Thumbnail filename:', thumbnailFilename);
  console.log('📸 Storage key:', storageKey);
  console.log('📸 Final thumbnail URL:', result);
  return result;
}