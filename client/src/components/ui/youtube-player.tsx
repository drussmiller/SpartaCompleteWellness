import React from 'react';
import { cn } from '@/lib/utils';
import '../ui/activity-content.css';

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
  title?: string;
  autoplay?: boolean;
  allowFullScreen?: boolean;
  width?: string;
  height?: string;
}

export function YouTubePlayer({
  videoId,
  className,
  title = 'YouTube video player',
  autoplay = false,
  allowFullScreen = true,
  width = '100%',
  height = '100%',
}: YouTubePlayerProps) {
  // Extract video ID from YouTube URL if a full URL is provided
  const getYouTubeId = (url: string): string => {
    if (!url) return '';
    
    // Clean up the input string - remove any HTML tags
    const cleanUrl = url.replace(/<\/?[^>]+(>|$)/g, '').trim();
    
    if (!cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be')) {
      // Already a video ID, but clean it just in case
      return cleanUrl.replace(/[^a-zA-Z0-9_-]/g, '');
    }
    
    let id = '';
    
    // Handle youtu.be URLs
    if (cleanUrl.includes('youtu.be')) {
      id = cleanUrl.split('youtu.be/')[1];
      const ampersandPosition = id.indexOf('&');
      if (ampersandPosition !== -1) {
        id = id.substring(0, ampersandPosition);
      }
      return id;
    }
    
    // Handle youtube.com URLs
    if (cleanUrl.includes('v=')) {
      id = cleanUrl.split('v=')[1];
      const ampersandPosition = id.indexOf('&');
      if (ampersandPosition !== -1) {
        id = id.substring(0, ampersandPosition);
      }
      return id;
    }
    
    return cleanUrl;
  };

  const embedId = getYouTubeId(videoId);
  
  if (!embedId) return null;
  
  return (
    <div className={cn("video-wrapper", className)}>
      <iframe
        src={`https://www.youtube.com/embed/${embedId}${autoplay ? '?autoplay=1' : ''}`}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen={allowFullScreen}
      />
    </div>
  );
}