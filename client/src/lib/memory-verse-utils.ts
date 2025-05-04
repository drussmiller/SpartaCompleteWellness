/**
 * Utility functions for video thumbnails and posters
 * Works for both memory verse videos and miscellaneous video posts
 */

/**
 * Generate thumbnails for a video
 * This function calls the appropriate server-side endpoint based on video type
 * 
 * @param mediaUrl URL of the video
 * @param isMemoryVerse Optional flag to force using memory verse endpoint
 * @returns Promise resolving to the response data or null if failed
 */
export async function generateVideoThumbnails(mediaUrl: string, isMemoryVerse?: boolean): Promise<any> {
  try {
    // Determine if this is a memory verse by URL pattern
    // We can also accept an explicit flag to override this detection
    const isMemoryVerseVideo = isMemoryVerse ?? mediaUrl.includes('memory_verse');
    
    // Log the thumbnail generation request
    console.log(`Requesting thumbnail generation for video: ${mediaUrl}`);
    
    if (isMemoryVerseVideo) {
      // Use the memory verse endpoint for memory verse videos
      console.log("Using memory verse endpoint for thumbnail generation");
      const response = await fetch(`/api/memory-verse-thumbnails?mediaUrl=${encodeURIComponent(mediaUrl)}`);
      
      if (!response.ok) {
        console.error(`Memory verse thumbnail generation request failed with status: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      console.log(`Memory verse thumbnail generation response:`, data);
      
      return data;
    } else {
      // Use the generic thumbnail generator for miscellaneous videos
      console.log("Using generic endpoint for thumbnail generation");
      const response = await fetch(`/api/object-storage/generate-thumbnail?fileUrl=${encodeURIComponent(mediaUrl)}`);
      
      if (!response.ok) {
        console.error(`Generic thumbnail generation request failed with status: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      console.log(`Generic thumbnail generation response:`, data);
      
      return data;
    }
  } catch (error) {
    console.error('Error generating video thumbnails:', error);
    return null;
  }
}

// Keep the generateMemoryVerseThumbnails for backward compatibility
export async function generateMemoryVerseThumbnails(mediaUrl: string): Promise<any> {
  return generateVideoThumbnails(mediaUrl, true);
}

/**
 * Get the poster URL for a video
 * This is a synchronous function that returns the most likely poster URL
 * based on the video URL pattern
 * 
 * @param mediaUrl URL of the video
 * @returns The predicted poster URL or undefined if not applicable
 */
export function getMemoryVersePoster(mediaUrl: string | null): string | undefined {
  return getVideoPoster(mediaUrl);
}

/**
 * Get the poster URL for any video type
 * Works for both memory verse and miscellaneous video posts
 * 
 * @param mediaUrl URL of the video
 * @returns The predicted poster URL or undefined if not applicable
 */
export function getVideoPoster(mediaUrl: string | null): string | undefined {
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
  
  // Use direct download to access the thumbnail from object storage
  // Add a random query parameter to bypass caching
  const timestamp = Date.now();
  const posterUrl = `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${posterFilename}&v=${timestamp}`;
  
  // Log the poster URL
  console.log(`Using video poster from: ${posterUrl} for video: ${mediaUrl}`);
  
  return posterUrl;
}

/**
 * Handle a failed video poster load by requesting thumbnail generation
 * This function should be called when a video poster fails to load
 * Works for both memory verse and regular videos
 * 
 * @param mediaUrl URL of the video
 * @returns Promise resolving to true if thumbnails were successfully generated
 */
export async function handleFailedPosterLoad(mediaUrl: string): Promise<boolean> {
  try {
    console.log(`Handling failed poster load for: ${mediaUrl}`);
    
    // First try memory verse endpoint if this looks like a memory verse
    const isMemoryVerse = mediaUrl.includes('memory_verse');
    
    // Request thumbnail generation using the appropriate endpoint
    const result = await generateVideoThumbnails(mediaUrl, isMemoryVerse);
    
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