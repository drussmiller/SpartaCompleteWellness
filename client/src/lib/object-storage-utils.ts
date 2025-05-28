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
  
  // Check if this is already a direct download URL to prevent nesting
  if (key.includes('/api/object-storage/direct-download')) {
    return key;
  }
  
  // Remove leading slash if present (keys in Object Storage don't start with /)
  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  
  // Always use the shared Object Storage path to save space
  // Only add the shared/ prefix if it's not already there
  const sharedKey = cleanKey.startsWith('shared/') ? cleanKey : `shared/${cleanKey}`;
  
  // Special handling for MOV files - use JPG versions for thumbnails
  if (sharedKey.toLowerCase().endsWith('.mov') && sharedKey.includes('/thumbnails/')) {
    // If this is a thumbnail for a MOV file, we need to prioritize the JPG version
    
    // Check if this is a thumb-prefixed version
    const isThumbPrefixed = sharedKey.includes('thumb-');
    
    // Create multiple alternatives to try for maximum compatibility
    // First: Try the .poster.jpg version in thumbnails directory (best quality)
    let baseKey = sharedKey;
    if (isThumbPrefixed) {
      // Remove the thumb- prefix first if it exists
      baseKey = sharedKey.replace('thumb-', '');
    }
    
    // Convert the extension
    const baseNameWithoutExt = baseKey.substring(0, baseKey.lastIndexOf('.'));
    const posterJpgKey = `${baseNameWithoutExt}.poster.jpg`;
    
    console.log(`Using poster JPG for MOV thumbnail: ${posterJpgKey}`);
    return `/api/object-storage/direct-download?fileUrl=${encodeURIComponent(posterJpgKey)}`;
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
  
  // Special handling for MOV files - check for all possible variations of thumbnails
  let keysToTry = [sharedKey];
  if (sharedKey.toLowerCase().endsWith('.mov') && sharedKey.includes('/thumbnails/')) {
    // Check if this is a thumb-prefixed version
    const isThumbPrefixed = sharedKey.includes('thumb-');
    
    // First try the poster.jpg version
    let baseKey = sharedKey;
    if (isThumbPrefixed) {
      // Remove the thumb- prefix if it exists
      baseKey = sharedKey.replace('thumb-', '');
    }
    
    // Create all possible variations
    const baseNameWithoutExt = baseKey.substring(0, baseKey.lastIndexOf('.'));
    const posterJpgKey = `${baseNameWithoutExt}.poster.jpg`;
    const regularJpgKey = `${baseNameWithoutExt}.jpg`;
    
    // Add all variations to the keys to try with most preferred first
    keysToTry = [
      posterJpgKey,     // First try poster.jpg version - best quality
      regularJpgKey,    // Then try regular jpg version
      sharedKey         // Finally try the original key (MOV)
    ];
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