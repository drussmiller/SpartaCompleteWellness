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
 * Creates a simple, clean media URL
 */
export function createMediaUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';

  console.log('createMediaUrl called with:', mediaUrl);

  // Handle base64 data URLs directly
  if (mediaUrl.startsWith('data:')) {
    console.log('Base64 data URL, returning as-is');
    return mediaUrl;
  }

  // Handle full HTTP URLs directly
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    console.log('Full HTTP URL, returning as-is');
    return mediaUrl;
  }

  // If it's already a direct download URL, return as-is
  if (mediaUrl.startsWith('/api/object-storage/direct-download')) {
    console.log('Already a direct download URL, returning as-is');
    return mediaUrl;
  }

  // Extract clean filename
  const filename = extractCleanFilename(mediaUrl);
  if (!filename) {
    console.error('Could not extract filename from:', mediaUrl);
    return '';
  }

  console.log('Extracted clean filename:', filename);

  // Create simple, direct path
  const cleanPath = `shared/uploads/${filename}`;
  const result = `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanPath)}`;
  
  console.log('Created clean media URL:', result);
  return result;
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

  // Extract clean filename
  const filename = extractCleanFilename(mediaUrl);
  if (!filename) {
    console.error('Could not extract filename for thumbnail from:', mediaUrl);
    return '';
  }

  console.log('Creating thumbnail for filename:', filename);

  // For video files, try poster thumbnail
  if (filename.toLowerCase().endsWith('.mov')) {
    const baseName = filename.substring(0, filename.lastIndexOf('.'));
    const posterPath = `shared/uploads/thumbnails/${baseName}.poster.jpg`;
    const result = `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(posterPath)}`;
    console.log('Created video poster URL:', result);
    return result;
  }

  // For images, try the actual poster format that exists
  const fileBase = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
  const posterPath = `shared/uploads/thumbnails/${fileBase}.poster.jpg`;
  const result = `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(posterPath)}`;
  console.log('Created image thumbnail URL:', result);
  return result;
}