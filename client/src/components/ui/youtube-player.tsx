import React, { useEffect, useRef } from 'react';

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

export function YouTubePlayer({ videoId, className = '' }: YouTubePlayerProps) {
  const cleanVideoId = extractYouTubeId(videoId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;

    // Handle fullscreen state changes to enable orientation on Android
    const handleFullscreenChange = async () => {
      const isFullscreen = document.fullscreenElement === wrapperRef.current || 
                          (document as any).webkitFullscreenElement === wrapperRef.current;
      
      if (isFullscreen) {
        // Entering fullscreen - try to lock to landscape on Android
        try {
          const screenOrientation = screen.orientation as any;
          if (screenOrientation && typeof screenOrientation.lock === 'function') {
            await screenOrientation.lock('landscape');
          }
        } catch (error) {
          console.log('Could not lock orientation:', error);
        }
      } else {
        // Exiting fullscreen - unlock orientation
        try {
          const screenOrientation = screen.orientation as any;
          if (screenOrientation && typeof screenOrientation.unlock === 'function') {
            screenOrientation.unlock();
          }
        } catch (error) {
          console.log('Could not unlock orientation:', error);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  if (!cleanVideoId) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">Invalid YouTube video ID or URL</span>
      </div>
    );
  }

  return (
    <div 
      ref={wrapperRef}
      className={`video-wrapper ${className}`} 
      style={{ overflow: 'visible' }}
    >
      <iframe
        ref={iframeRef}
        src={`https://www.youtube.com/embed/${cleanVideoId}?fs=1&playsinline=0&modestbranding=1`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      ></iframe>
    </div>
  );
}