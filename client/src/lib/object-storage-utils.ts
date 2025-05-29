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

  console.log('createDirectDownloadUrl called with:', key);

  // If this is already a complete direct download URL, return as-is
  if (key.startsWith('/api/object-storage/direct-download')) {
    console.log('Already a direct download URL, returning as-is');
    return key;
  }

  // If this is a full URL (starts with http), return as-is
  if (key.startsWith('http://') || key.startsWith('https://')) {
    console.log('Already a full URL, returning as-is');
    return key;
  }

  // If this is a base64 data URL, return as-is
  if (key.startsWith('data:')) {
    console.log('Base64 data URL, returning as-is');
    return key;
  }

  // CRITICAL: If the key contains any problematic patterns, extract the filename only
  if (key.includes('direct-download') || key.includes('fileUrl=')) {
    console.error('BLOCKED: Key contains nested URL patterns, extracting filename only:', key);

    // Try to extract just the filename from the nested URL
    const fileUrlMatch = key.match(/fileUrl=([^&]+)/);
    if (fileUrlMatch) {
      const decodedPath = decodeURIComponent(fileUrlMatch[1]);
      const filename = decodedPath.split('/').pop();
      if (filename) {
        console.log('Extracted filename from nested URL:', filename);
        const cleanPath = `shared/uploads/${filename}`;
        return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanPath)}`;
      }
    }

    // Fallback: extract any filename at the end
    const filename = key.split('/').pop()?.split('?')[0];
    if (filename && filename !== key) {
      console.log('Fallback filename extraction:', filename);
      const cleanPath = `shared/uploads/${filename}`;
      return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanPath)}`;
    }

    console.error('Could not extract filename from nested URL, returning empty');
    return '';
  }

  // Clean the key - remove leading slash and normalize path
  let cleanKey = key.replace(/^\/+/, '');

  // If it already starts with 'shared/', use it as-is
  if (cleanKey.startsWith('shared/')) {
    console.log(`Using path as-is: ${cleanKey}`);
    return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanKey)}`;
  }

  // If it starts with 'uploads/', prepend 'shared/'
  if (cleanKey.startsWith('uploads/')) {
    const finalPath = `shared/${cleanKey}`;
    console.log(`Converted uploads path: ${key} -> ${finalPath}`);
    return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(finalPath)}`;
  }

  // Extract just the filename and use default path
  const filename = cleanKey.split('/').pop() || cleanKey;
  const finalPath = `shared/uploads/${filename}`;

  console.log(`Creating clean URL: ${key} -> /api/object-storage/direct-download?fileUrl=${encodeURIComponent(finalPath)}`);

  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(finalPath)}`;
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
    if (!url) {
      console.error('checkFileExists: Could not create valid URL for key:', key);
      return false;
    }
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

export function getObjectStorageUrl(path: string): string {
  if (!path) return '';

  // Check if this is already an Object Storage URL to prevent nesting
  if (path.includes('direct-download?fileUrl=')) {
    return path;
  }

  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;

  // Add timestamp to prevent caching issues
  const timestamp = Date.now();

  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanPath)}&v=${timestamp}`;
}