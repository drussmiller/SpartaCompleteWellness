
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

  // Extract the actual file path from any existing nested URLs
  let cleanKey = key;

  // Handle nested direct-download URLs
  if (cleanKey.includes('direct-download?fileUrl=')) {
    const match = cleanKey.match(/fileUrl=([^&]+)/);
    if (match) {
      cleanKey = decodeURIComponent(match[1]);
    }
  }

  // Handle other nested patterns
  if (cleanKey.includes('?fileUrl=')) {
    const match = cleanKey.match(/fileUrl=([^&]+)/);
    if (match) {
      cleanKey = decodeURIComponent(match[1]);
    }
  }

  // Remove any leading slash
  cleanKey = cleanKey.startsWith('/') ? cleanKey.substring(1) : cleanKey;

  // Remove any path prefixes that might have gotten duplicated
  cleanKey = cleanKey.replace(/^(shared\/)?uploads\//, '');
  cleanKey = cleanKey.replace(/^(shared\/)?thumbnails\//, '');

  // Always use the shared path for consistency
  const finalKey = `shared/uploads/${cleanKey}`;

  // Return the clean URL
  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(finalKey)}`;
}

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
