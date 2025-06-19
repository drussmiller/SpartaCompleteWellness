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
export function createThumbnailUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';

  console.log('createThumbnailUrl called with:', mediaUrl);

  // Handle base64 data URLs - no thumbnails available
  if (mediaUrl.startsWith('data:')) {
    return '';
  }

  // Extract the filename from the mediaUrl
  let filename = '';
  
  if (mediaUrl.includes('filename=')) {
    // Extract from serve-file URL
    const urlParams = new URLSearchParams(mediaUrl.split('?')[1]);
    filename = urlParams.get('filename') || '';
  } else if (mediaUrl.includes('/')) {
    // Extract from path
    filename = mediaUrl.split('/').pop() || '';
  } else {
    // Assume it's already a filename
    filename = mediaUrl;
  }

  console.log('Extracted filename for thumbnail:', filename);

  // For video files (.mov, .mp4, etc.), use simplified thumbnail naming
  if (filename.toLowerCase().match(/\.(mov|mp4|webm|avi)$/)) {
    // Replace video extension with .jpg for thumbnail
    const baseName = filename.substring(0, filename.lastIndexOf('.'));
    const thumbnailFilename = `${baseName}.jpg`;
    const result = `/api/serve-file?filename=${encodeURIComponent(thumbnailFilename)}`;
    console.log('Created video thumbnail URL:', result);
    return result;
  }

  // For images, return empty string (no thumbnails for images)
  console.log('No thumbnail for image file:', filename);
  return '';
}