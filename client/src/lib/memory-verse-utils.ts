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
 * @param useEnhanced Optional flag to use the enhanced thumbnail generator (default true)
 * @returns Promise resolving to the response data or null if failed
 */
export async function generateVideoThumbnails(
  mediaUrl: string, 
  isMemoryVerse?: boolean,
  useEnhanced: boolean = true
): Promise<any> {
  try {
    // Determine if this is a memory verse by URL pattern
    // We can also accept an explicit flag to override this detection
    const isMemoryVerseVideo = isMemoryVerse ?? mediaUrl.includes('memory_verse');
    
    // Log the thumbnail generation request
    console.log(`Requesting thumbnail generation for video: ${mediaUrl}`, {
      isMemoryVerseVideo,
      useEnhanced
    });
    
    // If using enhanced mode, we'll use the new dedicated thumbnail generator API
    if (useEnhanced) {
      console.log("Using enhanced thumbnail generator API");
      const response = await fetch('/api/generate-thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ videoUrl: mediaUrl })
      });
      
      if (!response.ok) {
        console.error(`Enhanced thumbnail generation failed with status: ${response.status}`);
        // Fall back to the older methods if enhanced fails
        return generateVideoThumbnails(mediaUrl, isMemoryVerse, false);
      }
      
      const data = await response.json();
      console.log(`Enhanced thumbnail generation response:`, data);
      
      return data;
    }
    // Fall back to legacy endpoints if enhanced mode is disabled
    else if (isMemoryVerseVideo) {
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
  
  console.log('getVideoPoster called with:', mediaUrl);
  
  // CRITICAL: Check for nested URLs first
  if (mediaUrl.includes('direct-download')) {
    console.warn('getVideoPoster received nested URL, extracting clean path:', mediaUrl);
    const fileUrlMatch = mediaUrl.match(/fileUrl=([^&]+)/);
    if (fileUrlMatch) {
      const cleanPath = decodeURIComponent(fileUrlMatch[1]);
      console.log('getVideoPoster extracted clean path:', cleanPath);
      
      if (!cleanPath.includes('direct-download')) {
        return getVideoPoster(cleanPath); // Recursive call with clean path
      } else {
        console.error('getVideoPoster detected multiple levels of nesting, aborting:', cleanPath);
        return undefined;
      }
    }
    console.error('getVideoPoster could not extract clean path from:', mediaUrl);
    return undefined;
  }
  
  // Extract the filename from the media URL
  const urlParts = mediaUrl.split('/');
  const filename = urlParts[urlParts.length - 1];
  const fileBase = filename.split('.')[0];
  const fileExt = filename.split('.').pop()?.toLowerCase() || '';
  
  console.log('getVideoPoster processing filename:', filename, 'fileBase:', fileBase);
  
  // Check if it's a video file (support more formats than just .mov)
  const isVideoFile = mediaUrl.toLowerCase().match(/\.(mov|mp4|webm|avi|mkv)$/i);
  if (!isVideoFile) {
    console.log('getVideoPoster: Not a video file, returning undefined');
    return undefined;
  }
  
  // Add a random query parameter to bypass caching
  const timestamp = Date.now();
  
  // FIRST TRY - Use the actual poster format that exists in Object Storage
  // Your thumbnails are stored as .poster.jpg format, not thumb- prefix
  const posterFilename = `${fileBase}.poster.jpg`;
  const directPosterUrl = `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${posterFilename}&v=${timestamp}`;
  
  console.log('getVideoPoster created thumbnail URL:', directPosterUrl);
  return directPosterUrl;
}

/**
 * Generate alternative poster URLs for a video when the primary one fails
 * This function returns an array of alternative URLs to try
 * 
 * @param mediaUrl URL of the video 
 * @returns Array of alternative poster URLs to try
 */
export function getAlternativePosterUrls(mediaUrl: string | null): string[] {
  if (!mediaUrl) return [];
  
  const alternatives: string[] = [];
  const timestamp = Date.now();
  
  try {
    // Extract the filename from the media URL
    const urlParts = mediaUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const fileBase = filename.split('.')[0];
    const fileExt = filename.split('.').pop()?.toLowerCase();
    
    // Try different paths and patterns in priority order
    
    // 1. First try the new format: thumb-[filename].jpg
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/thumb-${fileBase}.jpg&v=${timestamp}`);
    alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/thumbnails/thumb-${fileBase}.jpg&v=${timestamp}`);
    
    // 2. Try with no prefix, just direct .jpg
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${fileBase}.jpg&v=${timestamp}`);
    alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/thumbnails/${fileBase}.jpg&v=${timestamp}`);
    
    // For backwards compatibility, also try the old formats:
    if (fileExt === 'mov') {
      // For MOV files, try the specific formats our thumbnail generator previously used
      alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/${fileBase}.mov.poster.jpg&v=${timestamp}`);
      alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/${fileBase}.mov.poster.jpg&v=${timestamp}`);
      alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${fileBase}.mov.poster.jpg&v=${timestamp}`);
      alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/thumbnails/${fileBase}.mov.poster.jpg&v=${timestamp}`);
    }
    
    // Now try the legacy formats for all video types
    
    // Try standard poster with .poster.jpg in various directories
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/${fileBase}.poster.jpg&v=${timestamp}`);
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${fileBase}.poster.jpg&v=${timestamp}`);
    
    // Try with thumb- prefix but legacy naming (.poster.jpg extension)
    const thumbPosterFilename = `thumb-${fileBase}.poster.jpg`;
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${thumbPosterFilename}&v=${timestamp}`);
    
    // Try with original file in root directories
    alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/${fileBase}.jpg&v=${timestamp}`);
    
    // Try with video-specific naming pattern for any extension
    if (fileExt) {
      const videoSpecificFilename = `${fileBase}.${fileExt}.poster.jpg`;
      alternatives.push(`/api/object-storage/direct-download?fileUrl=shared/uploads/${videoSpecificFilename}&v=${timestamp}`);
    }
    
    // 9. For maximum compatibility, also try with regular uploads directory (without shared)
    alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/${fileBase}.poster.jpg&v=${timestamp}`);
    alternatives.push(`/api/object-storage/direct-download?fileUrl=uploads/thumbnails/${fileBase}.poster.jpg&v=${timestamp}`);
    
    // Log all the alternatives we're going to try
    console.log(`Generated ${alternatives.length} alternative poster URLs to try:`, 
      alternatives.map(url => url.split('&v=')[0]).join('\n'));
    
  } catch (error) {
    console.error('Error generating alternative poster URLs:', error);
  }
  
  return alternatives;
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
    
    // Always use the enhanced thumbnail generator which will try multiple frame positions
    // This has the best chance of generating a usable thumbnail
    console.log(`Using enhanced thumbnail generator for failed poster: ${mediaUrl}`);
    
    // Request thumbnail generation using our new dedicated API endpoint
    const result = await fetch('/api/generate-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ videoUrl: mediaUrl })
    });
    
    if (!result.ok) {
      console.error(`Enhanced thumbnail generation failed with status: ${result.status}`);
      
      // Fall back to the old method as a last resort
      console.log('Falling back to legacy thumbnail generation method');
      const isMemoryVerse = mediaUrl.includes('memory_verse');
      const fallbackResult = await generateVideoThumbnails(mediaUrl, isMemoryVerse, false);
      
      if (!fallbackResult || !fallbackResult.success) {
        console.error('Failed to generate thumbnails with fallback method');
        return false;
      }
      
      console.log('Successfully generated thumbnails using fallback method');
      return true;
    }
    
    const data = await result.json();
    console.log('Successfully generated thumbnails after poster load failure:', data);
    
    // Add a cache-busting reload of the image after a delay
    // This helps ensure the UI shows the new thumbnail without requiring a page refresh
    setTimeout(() => {
      // Dispatch a custom event that VideoPlayer can listen for to refresh its poster
      const refreshEvent = new CustomEvent('thumbnail-regenerated', { 
        detail: { videoUrl: mediaUrl }
      });
      window.dispatchEvent(refreshEvent);
      
      console.log('Dispatched thumbnail-regenerated event');
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error handling failed poster load:', error);
    return false;
  }
}