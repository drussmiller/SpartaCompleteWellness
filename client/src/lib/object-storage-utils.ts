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
  
  // Always use the shared Object Storage path to save space
  // Only add the shared/ prefix if it's not already there
  const sharedKey = cleanKey.startsWith('shared/') ? cleanKey : `shared/${cleanKey}`;
  
  // Special handling for MOV files - use JPG versions for thumbnails
  if (sharedKey.toLowerCase().endsWith('.mov') && sharedKey.includes('/thumbnails/')) {
    const jpgKey = sharedKey.replace(/\.mov$/i, '.jpg');
    console.log(`Converting MOV thumbnail to JPG: ${jpgKey}`);
    return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(jpgKey)}`;
  }
  
  // Return the URL with the key as a query parameter
  return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(sharedKey)}`;
}

/**
 * Checks if a key exists in Object Storage
 * @param key The storage key to check
 */
export async function checkFileExists(key: string): Promise<boolean> {
  // Remove leading slash if present
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  
  // Always use shared path if not provided
  const sharedKey = cleanKey.startsWith('shared/') ? cleanKey : `shared/${cleanKey}`;
  
  // Special handling for MOV files - check for JPG version for thumbnails
  let keysToTry = [sharedKey];
  if (sharedKey.toLowerCase().endsWith('.mov') && sharedKey.includes('/thumbnails/')) {
    const jpgKey = sharedKey.replace(/\.mov$/i, '.jpg');
    keysToTry.unshift(jpgKey); // Try JPG first for better browser compatibility
  }
  
  try {
    // Try each key until one succeeds
    for (const keyToTry of keysToTry) {
      try {
        const response = await fetch(`/api/object-storage/direct-download?fileUrl=${encodeURIComponent(keyToTry)}`, {
          method: 'HEAD'
        });
        
        if (response.ok) {
          return true;
        }
      } catch (err) {
        // Continue to next key
      }
    }
    
    return false;
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
  
  // Always use shared path if not provided
  const sharedPrefix = cleanPrefix.startsWith('shared/') ? cleanPrefix : `shared/${cleanPrefix}`;
  
  // Handle special case for MOV files
  const isMOVPrefix = sharedPrefix.toLowerCase().includes('.mov');
  let prefixesToTry = [sharedPrefix];
  
  if (isMOVPrefix) {
    // Also look for JPG versions
    const jpgPrefix = sharedPrefix.replace(/\.mov/i, '.jpg');
    prefixesToTry.push(jpgPrefix);
  }
  
  const allFiles: string[] = [];
  
  try {
    // Try each prefix and collect all files
    for (const prefixToTry of prefixesToTry) {
      try {
        const response = await fetch(`/api/object-storage/list?prefix=${encodeURIComponent(prefixToTry)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.files && Array.isArray(data.files)) {
            allFiles.push(...data.files);
          }
        }
      } catch (err) {
        // Continue to next prefix
      }
    }
    
    // Return unique files
    return Array.from(new Set(allFiles));
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