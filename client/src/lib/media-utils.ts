/**
 * Simple Media URL Utilities
 * 
 * This module provides clean, simple media URL handling without recursive patterns.
 */

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
export function createMediaUrl(url: string | null): string {
  if (!url) return '';

  console.log('createMediaUrl called with:', url);

  // If it's already a complete URL (starts with http), return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    console.log('Already a complete URL, returning as-is');
    return url;
  }

  // If it's a base64 data URL, return as-is
  if (url.startsWith('data:')) {
    console.log('Base64 data URL, returning as-is');
    return url;
  }

  // If it starts with /api/, return as-is (it's already a proper API route)
  if (url.startsWith('/api/')) {
    console.log('Already an API route, returning as-is');
    return url;
  }

  // Extract filename from various URL formats
  let filename: string;

  if (url.startsWith('shared/uploads/')) {
    // Extract filename from Object Storage path
    filename = url.split('/').pop() || '';
    console.log('Extracted filename from Object Storage path:', filename);
  } else if (url.startsWith('/uploads/')) {
    // Legacy format - extract filename
    filename = url.split('/').pop() || '';
    console.log('Extracted filename from legacy uploads path:', filename);
  } else if (url.includes('/')) {
    // Any other path format - get the last part
    filename = url.split('/').pop() || '';
    console.log('Extracted filename from path:', filename);
  } else {
    // Assume it's already just a filename
    filename = url;
    console.log('Using as filename directly:', filename);
  }

  // Clean the filename
  const cleanFilename = filename.replace(/^\/+/, '');
  console.log('Cleaned filename:', cleanFilename);

  // Check if we're in development mode and this looks like an Object Storage file
  if (url.startsWith('shared/uploads/')) {
    const filename = url.split('/').pop() || '';

    // Use serve-file endpoint for all Object Storage files for consistency
    const serveFileUrl = `/api/serve-file?filename=${encodeURIComponent(filename)}`;
    console.log('📁 Processing Object Storage file:', filename);
    console.log('📁 Using serve-file URL:', serveFileUrl);
    return serveFileUrl;
  }

  // For development environment, prioritize local serve-file route
  // This ensures compatibility with existing images stored locally
  const mediaUrl = `/api/serve-file?filename=${encodeURIComponent(cleanFilename)}`;
  console.log('Created serve-file media URL:', mediaUrl);

  return mediaUrl;
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