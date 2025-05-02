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
  
  // Remove leading slash if present (keys in Object Storage don't start with /)
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  
  // Return the URL with the key as a query parameter
  return `/api/object-storage/direct-download?key=${encodeURIComponent(cleanKey)}`;
}

/**
 * Checks if a key exists in Object Storage
 * @param key The storage key to check
 */
export async function checkFileExists(key: string): Promise<boolean> {
  // Remove leading slash if present
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  
  try {
    // First, try a HEAD request to the direct download endpoint
    const response = await fetch(`/api/object-storage/direct-download?key=${encodeURIComponent(cleanKey)}`, {
      method: 'HEAD'
    });
    
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
  // Remove leading slash if present
  const cleanPrefix = prefix.startsWith('/') ? prefix.substring(1) : prefix;
  
  try {
    const response = await fetch(`/api/object-storage/list?prefix=${encodeURIComponent(cleanPrefix)}`);
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.files || [];
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