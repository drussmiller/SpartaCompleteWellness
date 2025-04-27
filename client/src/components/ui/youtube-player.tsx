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
  
  // Special handling for Week 3 warmup video
  if (content.includes('JT49h1zSD6I')) {
    // Extract all iframes with this video ID
    const warmupVideoRegex = /<iframe[^>]*src="[^"]*JT49h1zSD6I[^"]*"[^>]*><\/iframe>/g;
    const matches = content.match(warmupVideoRegex);
    
    if (matches && matches.length > 1) {
      console.log(`Found ${matches.length} occurrences of Week 3 warmup video, keeping only one`);
      
      // Remove all video wrappers with this ID
      let cleanedContent = content.replace(
        /<div class="video-wrapper">(<iframe[^>]*src="[^"]*JT49h1zSD6I[^"]*"[^>]*><\/iframe>)<\/div>/g,
        ''
      );
      
      // If there's a place marker for the warmup video, put it there
      if (cleanedContent.includes('WARM UP VIDEO')) {
        return cleanedContent.replace(
          /<p>(<em>)?WARM UP VIDEO(<\/em>)?<\/p>/,
          `<p>WARM UP VIDEO</p><div class="video-wrapper">${matches[0]}</div>`
        );
      }
      
      // Otherwise add it to the beginning
      return `<div class="video-wrapper">${matches[0]}</div>${cleanedContent}`;
    }
  }
  
  return content;
}