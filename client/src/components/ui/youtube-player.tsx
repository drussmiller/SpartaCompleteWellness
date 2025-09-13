import React from 'react';

interface YouTubePlayerProps {
  videoId: string;
  autoPlay?: boolean;
  className?: string;
}

export function YouTubePlayer({
  videoId,
  autoPlay = false,
  className = ""
}: YouTubePlayerProps) {
  // Handle different YouTube URL formats and extract the ID
  const extractedId = extractYouTubeId(videoId);

  if (!extractedId) {
    console.error('Invalid YouTube video ID:', videoId);
    return null;
  }

  return (
    <div className={`youtube-video-container ${className}`}>
      <iframe
        src={`https://www.youtube.com/embed/${extractedId}${autoPlay ? '?autoplay=1' : ''}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
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