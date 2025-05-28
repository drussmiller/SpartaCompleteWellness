
/**
 * Object Storage Utils
 * This file provides utility functions for working with Object Storage
 */

/**
 * Creates a direct download URL using our API route
 * @param key The storage key to download
 * @returns URL for direct download
 */
export function createDirectDownloadUrl(key: string | null): string {
  if (!key) return '';

  // If this is already a complete direct download URL, return as-is
  if (key.startsWith('/api/object-storage/direct-download')) {
    return key;
  }

  // If this is a full URL (starts with http), return as-is
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  // Additional validation to catch malformed URLs early
  if (key.includes('direct-download') && !key.startsWith('/api/object-storage/')) {
    console.warn('Malformed URL detected, extracting clean path:', key);
    // Extract just the actual file path
    const fileUrlMatch = key.match(/fileUrl=([^&]+)/);
    if (fileUrlMatch) {
      const cleanPath = decodeURIComponent(fileUrlMatch[1]);
      if (!cleanPath.includes('direct-download')) {
        return createDirectDownloadUrl(cleanPath);
      }
    }
  }

  // Extract the actual file path from any existing nested URLs
  let cleanKey = key;

  // Handle nested direct-download URLs - keep extracting until we get the actual path
  let maxAttempts = 5; // Prevent infinite loops
  while (cleanKey.includes('direct-download') && maxAttempts > 0) {
    maxAttempts--;
    
    // Extract fileUrl parameter value
    const fileUrlMatch = cleanKey.match(/fileUrl=([^&]+)/);
    if (fileUrlMatch) {
      const decodedUrl = decodeURIComponent(fileUrlMatch[1]);
      // If the decoded URL is different from current, use it
      if (decodedUrl !== cleanKey && !decodedUrl.includes('direct-download')) {
        cleanKey = decodedUrl;
        break;
      } else if (decodedUrl !== cleanKey) {
        cleanKey = decodedUrl;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Handle other nested patterns
  maxAttempts = 3;
  while (cleanKey.includes('?fileUrl=') && maxAttempts > 0) {
    maxAttempts--;
    const match = cleanKey.match(/fileUrl=([^&]+)/);
    if (match) {
      const decodedUrl = decodeURIComponent(match[1]);
      if (decodedUrl !== cleanKey) {
        cleanKey = decodedUrl;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Remove any leading slash
  cleanKey = cleanKey.startsWith('/') ? cleanKey.substring(1) : cleanKey;

  // Clean up duplicate path segments
  cleanKey = cleanKey.replace(/^(shared\/)+/, 'shared/');
  cleanKey = cleanKey.replace(/^(uploads\/)+/, 'uploads/');
  cleanKey = cleanKey.replace(/^(thumbnails\/)+/, 'thumbnails/');

  // Ensure proper shared path structure
  if (!cleanKey.startsWith('shared/')) {
    // If it starts with uploads/ or thumbnails/, prepend shared/
    if (cleanKey.startsWith('uploads/') || cleanKey.startsWith('thumbnails/')) {
      cleanKey = `shared/${cleanKey}`;
    } else {
      // Otherwise, assume it's a filename that goes in uploads
      cleanKey = `shared/uploads/${cleanKey}`;
    }
  }

  // Return the clean URL
  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanKey)}`;
}

/**
 * Alias for createDirectDownloadUrl to maintain compatibility
 */
export const createCleanFileUrl = createDirectDownloadUrl;

/**
 * Checks if a key exists in Object Storage
 * @param key The storage key to check
 */
export async function checkFileExists(key: string): Promise<boolean> {
  try {
    const url = createDirectDownloadUrl(key);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error(`Error checking if file exists: ${key}`, error);
    return false;
  }
}

/**
 * Lists all files in Object Storage with a given prefix
 * @param prefix The prefix to search for
 */
export async function listFiles(prefix: string): Promise<string[]> {
  try {
    // Clean prefix
    const cleanPrefix = prefix.startsWith('/') ? prefix.substring(1) : prefix;
    const sharedPrefix = cleanPrefix.startsWith('shared/') ? cleanPrefix : `shared/${cleanPrefix}`;

    const response = await fetch(`/api/object-storage/list?prefix=${encodeURIComponent(sharedPrefix)}`);
    if (response.ok) {
      const data = await response.json();
      return data.files || [];
    }
    return [];
  } catch (error) {
    console.error(`Error listing files with prefix: ${prefix}`, error);
    return [];
  }
}

/**
 * Tests the Object Storage API
 * This is useful for debugging Object Storage issues
 */
export async function testObjectStorage(): Promise<any> {
  try {
    const response = await fetch('/api/object-storage/test');
    if (!response.ok) {
      throw new Error(`Failed to test Object Storage: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error testing Object Storage API:', error);
    throw error;
  }
}
