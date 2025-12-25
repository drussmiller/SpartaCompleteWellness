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
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    const isAndroid = navigator.userAgent.toLowerCase().indexOf('android') > -1;
    if (!isAndroid) return;

    // For YouTube iframe fullscreen, we need to monitor when it goes fullscreen
    // and request landscape orientation
    const checkFullscreenAndLock = async () => {
      // Check if any element is in fullscreen
      const isInFullscreen = !!document.fullscreenElement || 
                            !!(document as any).webkitFullscreenElement ||
                            !!(document as any).mozFullScreenElement ||
                            !!(document as any).msFullscreenElement;

      if (isInFullscreen) {
        // Try to lock orientation to landscape when fullscreen is detected
        try {
          const screenOrientation = screen.orientation as any;
          if (screenOrientation && typeof screenOrientation.lock === 'function') {
            await screenOrientation.lock('landscape').catch(() => {
              // Silently fail - some browsers don't support this
            });
          }
        } catch (error) {
          // Silently fail
        }
      }
    };

    // Start checking for fullscreen every 500ms
    checkIntervalRef.current = setInterval(checkFullscreenAndLock, 500);

    // Also listen for fullscreen changes
    const handleFullscreenChange = async () => {
      await checkFullscreenAndLock();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
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
      style={{ overflow: 'visible', position: 'relative' }}
    >
      <iframe
        ref={iframeRef}
        src={`https://www.youtube.com/embed/${cleanVideoId}?fs=1&playsinline=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&controls=1&disablekb=1&origin=${window.location.origin}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      ></iframe>
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
          pointerEvents: 'none'
        }}
      >
        {/* Top "shield" for title and logo - reduced height to avoid blocking playback toggle in center */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '45px',
            pointerEvents: 'auto',
            cursor: 'default'
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        {/* Bottom-right "shield" for YouTube logo button - positioned to avoid controls */}
        <div 
          style={{
            position: 'absolute',
            bottom: '5px',
            right: '60px',
            width: '60px',
            height: '40px',
            pointerEvents: 'auto',
            cursor: 'default'
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      </div>
    </div>
  );
}