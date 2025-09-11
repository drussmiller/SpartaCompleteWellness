import React, { useEffect, useRef } from 'react';

interface YouTubePlayerProps {
  videoId: string;
  autoPlay?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

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
  // Return content as-is without any duplicate removal
  return content || '';
}