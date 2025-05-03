/**
 * Utility functions for memory verse videos
 */

/**
 * Generate thumbnails for a memory verse video
 * This function calls the server-side endpoint that generates multiple thumbnail variants
 * for memory verse videos
 * 
 * @param mediaUrl URL of the memory verse video
 * @returns Promise resolving to the response data or null if failed
 */
export async function generateMemoryVerseThumbnails(mediaUrl: string): Promise<any> {
  try {
    // Log the thumbnail generation request
    console.log(`Requesting thumbnail generation for memory verse: ${mediaUrl}`);
    
    // Use the production endpoint with mediaUrl as a query parameter
    const response = await fetch(`/api/memory-verse-thumbnails?mediaUrl=${encodeURIComponent(mediaUrl)}`);
    
    if (!response.ok) {
      console.error(`Thumbnail generation request failed with status: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`Thumbnail generation response:`, data);
    
    return data;
  } catch (error) {
    console.error('Error generating memory verse thumbnails:', error);
    return null;
  }
}

/**
 * Get the poster URL for a memory verse video
 * This is a synchronous function that returns the most likely poster URL
 * based on the video URL pattern
 * 
 * @param mediaUrl URL of the memory verse video
 * @returns The predicted poster URL or undefined if not applicable
 */
export function getMemoryVersePoster(mediaUrl: string | null): string | undefined {
  if (!mediaUrl) return undefined;
  
  // Extract the filename from the media URL
  const urlParts = mediaUrl.split('/');
  const filename = urlParts[urlParts.length - 1];
  const fileBase = filename.split('.')[0];
  
  // Check if it's a MOV file
  const isMovFile = mediaUrl.toLowerCase().endsWith('.mov');
  if (!isMovFile) return undefined;
  
  // Construct the poster URL with poster suffix
  // This follows the naming convention used by the server-side thumbnail generator
  const posterFilename = `${fileBase}.poster.jpg`;
  
  // Start with the thumbnails directory
  // This matches the server-side path construction in createAllMovThumbnailVariants
  const posterUrl = `/uploads/thumbnails/${posterFilename}`;
  
  return posterUrl;
}

/**
 * Handle a failed video poster load by requesting thumbnail generation
 * This function should be called when a video poster fails to load
 * 
 * @param mediaUrl URL of the memory verse video
 * @returns Promise resolving to true if thumbnails were successfully generated
 */
export async function handleFailedPosterLoad(mediaUrl: string): Promise<boolean> {
  try {
    console.log(`Handling failed poster load for: ${mediaUrl}`);
    
    // Request thumbnail generation
    const result = await generateMemoryVerseThumbnails(mediaUrl);
    
    if (!result || !result.success) {
      console.error('Failed to generate thumbnails on poster load failure');
      return false;
    }
    
    console.log('Successfully generated thumbnails after poster load failure');
    return true;
  } catch (error) {
    console.error('Error handling failed poster load:', error);
    return false;
  }
}