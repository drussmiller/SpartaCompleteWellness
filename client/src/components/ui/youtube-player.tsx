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
  
  // Find all video occurrences and their positions
  const videoWrapperRegex = /<div class="video-wrapper">(<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>)<\/div>/g;
  const iframeRegex = /<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>/g;
  
  // Collect all video matches with their positions
  const videoMatches = [];
  let match;
  
  // First collect wrapped videos
  while ((match = videoWrapperRegex.exec(content)) !== null) {
    videoMatches.push({
      videoId: match[2],
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      type: 'wrapped'
    });
  }
  
  // Reset and collect unwrapped videos (that aren't already wrapped)
  iframeRegex.lastIndex = 0;
  while ((match = iframeRegex.exec(content)) !== null) {
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;
    
    // Check if this iframe is already part of a wrapped video
    const isAlreadyWrapped = videoMatches.some(vm => 
      vm.type === 'wrapped' && startIndex >= vm.startIndex && endIndex <= vm.endIndex
    );
    
    if (!isAlreadyWrapped) {
      videoMatches.push({
        videoId: match[1],
        fullMatch: match[0],
        startIndex: startIndex,
        endIndex: endIndex,
        type: 'unwrapped'
      });
    }
  }
  
  // Only proceed if we actually have videos
  if (videoMatches.length === 0) {
    console.log('No videos found in content');
    return content;
  }
  
  // Sort by position (earliest first)
  videoMatches.sort((a, b) => a.startIndex - b.startIndex);
  
  // Find duplicates - keep the first occurrence of each video ID
  const seenVideoIds = new Set();
  const videosToRemove = [];
  
  videoMatches.forEach(video => {
    if (seenVideoIds.has(video.videoId)) {
      videosToRemove.push(video);
      console.log(`Marking duplicate ${video.type} video for removal: ${video.videoId}`);
    } else {
      seenVideoIds.add(video.videoId);
      console.log(`Keeping first instance of video: ${video.videoId}`);
    }
  });
  
  // Only modify content if we actually found duplicates
  if (videosToRemove.length === 0) {
    console.log('No duplicate videos found, returning original content');
    return content;
  }
  
  // Remove duplicates in reverse order (from end to start) to maintain correct indices
  videosToRemove.sort((a, b) => b.startIndex - a.startIndex);
  
  let processedContent = content;
  videosToRemove.forEach(video => {
    const before = processedContent.substring(0, video.startIndex);
    const after = processedContent.substring(video.endIndex);
    processedContent = before + after;
  });
  
  console.log(`Removed ${videosToRemove.length} duplicate videos, kept ${seenVideoIds.size} unique videos`);
  
  return processedContent;
}