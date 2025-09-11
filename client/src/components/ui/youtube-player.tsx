import React, { useEffect, useRef } from 'react';

interface YouTubePlayerProps {
  videoId: string;
  autoPlay?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

// Track which videos have been rendered to prevent duplicates
const renderedVideos = new Set<string>();

export function YouTubePlayer({
  videoId,
  autoPlay = false,
  width = 560,
  height = 315,
  className = ""
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Handle different YouTube URL formats and extract the ID
  const extractedId = extractYouTubeId(videoId);
  
  useEffect(() => {
    // Create special cleanup function for repeated renders
    return () => {
      // Check if this is a Week 3 warmup video (JT49h1zSD6I)
      if (extractedId === 'JT49h1zSD6I') {
        console.log('Cleaned up Week 3 warmup video from render tracking');
        renderedVideos.delete('JT49h1zSD6I'); 
      }
    };
  }, [extractedId]);
  
  // Prevent duplicate renders of the same video
  if (extractedId === 'JT49h1zSD6I' && renderedVideos.has(extractedId)) {
    console.log('Prevented duplicate render of Week 3 warmup video');
    return null;
  }
  
  if (extractedId === 'JT49h1zSD6I') {
    renderedVideos.add(extractedId);
    console.log('Added Week 3 warmup video to render tracking');
  }

  return (
    <div 
      ref={containerRef}
      className={`video-wrapper ${className}`} 
      style={{ 
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: '100%',
      }}
    >
      <iframe
        width={width}
        height={height}
        src={`https://www.youtube.com/embed/${extractedId}${autoPlay ? '?autoplay=1' : ''}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      ></iframe>
    </div>
  );
}

function extractYouTubeId(url: string): string {
  // If it's already just an ID (11 characters), return it
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }
  
  // Handle various YouTube URL formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  
  if (match && match[2].length === 11) {
    return match[2];
  }
  
  // Special case for Week 3 warmup video if ID is embedded in content
  if (url.includes('JT49h1zSD6I')) {
    return 'JT49h1zSD6I';
  }
  
  console.error('Invalid YouTube URL or ID:', url);
  return '';
}

// Function to be called from activity-page.tsx to handle duplicate videos in HTML content
export function removeDuplicateVideos(content: string): string {
  if (!content) return '';
  
  console.log('Processing content for duplicate videos');
  
  // Find all YouTube iframes and remove duplicates
  const iframeRegex = /<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>/g;
  const videoWrapperRegex = /<div class="video-wrapper">(<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>)<\/div>/g;
  
  // Track video IDs we've seen
  const seenVideoIds = new Set();
  let processedContent = content;
  
  // First, handle wrapped videos
  let match;
  const wrappedVideosToRemove = [];
  
  while ((match = videoWrapperRegex.exec(content)) !== null) {
    const videoId = match[2];
    const fullMatch = match[0];
    
    if (seenVideoIds.has(videoId)) {
      // This is a duplicate - mark for removal
      wrappedVideosToRemove.push(fullMatch);
      console.log(`Found duplicate wrapped video: ${videoId}`);
    } else {
      seenVideoIds.add(videoId);
    }
  }
  
  // Remove duplicate wrapped videos
  wrappedVideosToRemove.forEach(videoHtml => {
    const index = processedContent.indexOf(videoHtml);
    if (index !== -1) {
      processedContent = processedContent.substring(0, index) + processedContent.substring(index + videoHtml.length);
    }
  });
  
  // Reset regex for unwrapped videos
  iframeRegex.lastIndex = 0;
  const unwrappedVideosToRemove = [];
  
  while ((match = iframeRegex.exec(processedContent)) !== null) {
    const videoId = match[1];
    const fullMatch = match[0];
    
    if (seenVideoIds.has(videoId)) {
      // This is a duplicate - mark for removal
      unwrappedVideosToRemove.push(fullMatch);
      console.log(`Found duplicate unwrapped video: ${videoId}`);
    } else {
      seenVideoIds.add(videoId);
    }
  }
  
  // Remove duplicate unwrapped videos
  unwrappedVideosToRemove.forEach(videoHtml => {
    const index = processedContent.indexOf(videoHtml);
    if (index !== -1) {
      processedContent = processedContent.substring(0, index) + processedContent.substring(index + videoHtml.length);
    }
  });
  
  console.log(`Removed ${wrappedVideosToRemove.length + unwrappedVideosToRemove.length} duplicate videos`);
  
  return processedContent;
}