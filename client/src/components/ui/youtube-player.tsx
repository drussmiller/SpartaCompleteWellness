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
  
  
  
  console.error('Invalid YouTube URL or ID:', url);
  return '';
}

// Function to be called from activity-page.tsx to handle duplicate videos in HTML content
export function removeDuplicateVideos(content: string): string {
  if (!content) return '';
  
  console.log('Processing content for duplicate videos');
  
  // Find all video patterns - both wrapped and unwrapped
  const videoWrapperPattern = /<div class="video-wrapper"><iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe><\/div>/g;
  const iframePattern = /<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>/g;
  
  // Track all video occurrences with their positions
  const videoOccurrences = [];
  let match;
  
  // Find wrapped videos
  while ((match = videoWrapperPattern.exec(content)) !== null) {
    videoOccurrences.push({
      videoId: match[1],
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'wrapped'
    });
  }
  
  // Reset regex and find unwrapped iframes (not already captured in wrapped videos)
  iframePattern.lastIndex = 0;
  while ((match = iframePattern.exec(content)) !== null) {
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    
    // Check if this iframe is already part of a wrapped video
    const isAlreadyWrapped = videoOccurrences.some(v => 
      v.type === 'wrapped' && startIndex >= v.startIndex && endIndex <= v.endIndex
    );
    
    if (!isAlreadyWrapped) {
      videoOccurrences.push({
        videoId: match[1],
        fullMatch: match[0],
        startIndex: startIndex,
        endIndex: endIndex,
        type: 'iframe'
      });
    }
  }
  
  if (videoOccurrences.length === 0) {
    console.log('No videos found in content');
    return content;
  }
  
  console.log(`Found ${videoOccurrences.length} total video occurrences`);
  
  // Group by video ID and identify duplicates
  const videoGroups = new Map();
  videoOccurrences.forEach(video => {
    if (!videoGroups.has(video.videoId)) {
      videoGroups.set(video.videoId, []);
    }
    videoGroups.get(video.videoId).push(video);
  });
  
  // Collect videos to remove (keep first occurrence of each)
  const videosToRemove = [];
  videoGroups.forEach((occurrences, videoId) => {
    if (occurrences.length > 1) {
      console.log(`Found ${occurrences.length} occurrences of video ${videoId} - keeping first, removing ${occurrences.length - 1}`);
      // Sort by position and remove all but the first
      occurrences.sort((a, b) => a.startIndex - b.startIndex);
      videosToRemove.push(...occurrences.slice(1)); // Remove all except first
    }
  });
  
  if (videosToRemove.length === 0) {
    console.log('No duplicate videos found');
    return content;
  }
  
  // Remove duplicates in reverse order to maintain correct indices
  videosToRemove.sort((a, b) => b.startIndex - a.startIndex);
  
  let processedContent = content;
  videosToRemove.forEach(video => {
    const before = processedContent.substring(0, video.startIndex);
    const after = processedContent.substring(video.endIndex);
    processedContent = before + after;
    console.log(`Removed duplicate ${video.type} video: ${video.videoId}`);
  });
  
  console.log(`Total duplicate videos removed: ${videosToRemove.length}`);
  return processedContent;
}