
import React, { useRef } from 'react';

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

  if (!extractedId) {
    return <div>Invalid YouTube video ID</div>;
  }

  return (
    <div 
      ref={containerRef}
      className={`youtube-video-container ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '560px',
        aspectRatio: '16/9',
        margin: '15px auto',
        display: 'block'
      }}
    >
      <iframe
        src={`https://www.youtube.com/embed/${extractedId}${autoPlay ? '?autoplay=1' : ''}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        style={{
          width: '100%',
          height: '100%',
          border: 'none'
        }}
      />
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

  // Find all video wrapper patterns with YouTube embed
  const videoWrapperPattern = /<div class="video-wrapper"><iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe><\/div>/g;

  // Find all video IDs and their positions
  const videoMap = new Map();
  let match;
  let hasRemovals = false;

  while ((match = videoWrapperPattern.exec(content)) !== null) {
    const videoId = match[1];
    const fullMatch = match[0];

    if (videoMap.has(videoId)) {
      // This is a duplicate - we'll remove it
      videoMap.get(videoId).duplicates.push(fullMatch);
      hasRemovals = true;
    } else {
      // First occurrence - keep it
      videoMap.set(videoId, {
        firstMatch: fullMatch,
        duplicates: []
      });
    }
  }

  if (!hasRemovals) {
    console.log('No duplicate videos found');
    return content;
  }

  // Remove duplicates
  let processedContent = content;
  let totalRemoved = 0;

  videoMap.forEach((videoInfo, videoId) => {
    if (videoInfo.duplicates.length > 0) {
      console.log(`Removing ${videoInfo.duplicates.length} duplicate(s) of video ${videoId}`);

      videoInfo.duplicates.forEach(duplicateMatch => {
        processedContent = processedContent.replace(duplicateMatch, '');
        totalRemoved++;
      });
    }
  });

  console.log(`Total videos removed: ${totalRemoved}`);
  return processedContent;
}
