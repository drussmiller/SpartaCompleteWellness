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

  // If it's already a serve-file URL, return as-is
  if (mediaUrl.startsWith('/api/serve-file')) {
    console.log('Already a serve-file URL, returning as-is');
    return mediaUrl;
  }

  // If it's already a direct download URL, return as-is
  if (mediaUrl.startsWith('/api/object-storage/direct-download')) {
    console.log('Already a direct download URL, returning as-is');
    return mediaUrl;
  }

  // Extract just the filename from the end of the path
  let filename = mediaUrl;
  
  // Remove leading slashes and path components
  if (filename.includes('/')) {
    filename = filename.split('/').pop() || filename;
  }
  
  // Remove query parameters
  if (filename.includes('?')) {
    filename = filename.split('?')[0];
  }

  console.log('Cleaned filename:', filename);

  // Use the /api/serve-file route that works correctly
  const result = `/api/serve-file?filename=${encodeURIComponent(filename)}`;
  
  console.log('Created clean media URL:', result);
  return result;
}

/**
 * Creates a thumbnail URL for a given media file
 * Now just returns the original file URL since we're not creating separate thumbnails
 */
export function createThumbnailUrl(mediaUrl: string | null): string {
  if (!mediaUrl) return '';

  console.log('createThumbnailUrl called with:', mediaUrl);

  // Handle base64 data URLs - no thumbnails available
  if (mediaUrl.startsWith('data:')) {
    return '';
  }

  // For now, just return the original media URL since we're not creating thumbnails
  // This will use the original image/video file
  const result = createMediaUrl(mediaUrl);
  console.log('Using original media URL as thumbnail:', result);
  return result;
}