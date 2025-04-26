import React from 'react';
import { cn } from '@/lib/utils';

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
  title?: string;
  autoplay?: boolean;
  allowFullScreen?: boolean;
}

export function YouTubePlayer({
  videoId,
  className,
  title = 'YouTube video player',
  autoplay = false,
  allowFullScreen = true,
}: YouTubePlayerProps) {
  // Extract video ID from YouTube URL if a full URL is provided
  const getYouTubeId = (url: string): string => {
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return url; // Already a video ID
    }
    
    let id = '';
    
    // Handle youtu.be URLs
    if (url.includes('youtu.be')) {
      id = url.split('youtu.be/')[1];
      const ampersandPosition = id.indexOf('&');
      if (ampersandPosition !== -1) {
        id = id.substring(0, ampersandPosition);
      }
      return id;
    }
    
    // Handle youtube.com URLs
    if (url.includes('v=')) {
      id = url.split('v=')[1];
      const ampersandPosition = id.indexOf('&');
      if (ampersandPosition !== -1) {
        id = id.substring(0, ampersandPosition);
      }
      return id;
    }
    
    return url;
  };

  const embedId = getYouTubeId(videoId);
  
  return (
    <div className={cn("relative pt-[56.25%] w-full", className)}>
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube.com/embed/${embedId}${autoplay ? '?autoplay=1' : ''}`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen={allowFullScreen}
      />
    </div>
  );
}