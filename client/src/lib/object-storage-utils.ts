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

  // CRITICAL: If the key contains any problematic patterns, reject it
  if (key.includes('direct-download') || key.includes('fileUrl=')) {
    console.error('BLOCKED: Key contains nested URL patterns:', key);
    return '';
  }

  // Clean the key - remove leading slash and normalize path
  let cleanKey = key.replace(/^\/+/, '');

  // Ensure proper shared path structure
  if (!cleanKey.startsWith('shared/')) {
    if (cleanKey.startsWith('uploads/') || cleanKey.startsWith('thumbnails/')) {
      cleanKey = `shared/${cleanKey}`;
    } else {
      cleanKey = `shared/uploads/${cleanKey}`;
    }
  }

  // Remove any double slashes
  cleanKey = cleanKey.replace(/\/+/g, '/');

  console.log(`Creating clean URL: ${key} -> /api/object-storage/direct-download?fileUrl=${encodeURIComponent(cleanKey)}`);

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