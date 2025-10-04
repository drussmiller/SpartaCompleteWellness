import React from 'react';

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
}

function extractYouTubeId(url: string): string {
  // If it's already just an ID (11 characters), return it
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  // Handle various YouTube URL formats
  // Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/v/ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the ID itself
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  console.error('Invalid YouTube URL or ID:', url);
  return '';
}

// Duplicate video removal has been disabled
export function removeDuplicateVideos(content: string): string {
  // Return content unchanged - duplicate video removal is disabled
  return content;
}

export default function YouTubePlayer({ videoId, className = '' }: YouTubePlayerProps) {
  const cleanVideoId = extractYouTubeId(videoId);

  if (!cleanVideoId) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">Invalid YouTube video ID or URL</span>
      </div>
    );
  }

  return (
    <div className={`video-wrapper ${className}`}>
      <iframe
        src={`https://www.youtube.com/embed/${cleanVideoId}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
}