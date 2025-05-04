import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getVideoPoster } from '@/lib/memory-verse-utils';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  preload?: 'none' | 'metadata' | 'auto';
  playsInline?: boolean;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  disablePictureInPicture?: boolean;
  controlsList?: string;
}

export function VideoPlayer({
  src,
  poster: initialPoster,
  className,
  preload = 'metadata',
  playsInline = true,
  onError,
  onLoad,
  disablePictureInPicture = false,
  controlsList = 'nodownload'
}: VideoPlayerProps) {
  // Try to get video poster if it's a MOV file
  const videoPoster = src?.toLowerCase().endsWith('.mov') ? getVideoPoster(src) : undefined;
  const poster = videoPoster || initialPoster;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Log mounted state for debugging
  useEffect(() => {
    console.log("SimplifiedVideoPlayer mounted with src:", src);
    console.log("Using poster:", poster);
  }, [src, poster]);

  // Play/pause function that uses the native video controls
  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!videoRef.current) {
      console.error("Video element reference is null");
      return;
    }
    
    try {
      if (videoRef.current.paused) {
        console.log("Attempting to play video");
        const playPromise = videoRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Video playback started successfully");
              setIsPlaying(true);
            })
            .catch(error => {
              console.error("Error playing video:", error);
              setIsPlaying(false);
              if (onError) onError(new Error(`Failed to play video: ${error.message}`));
            });
        }
      } else {
        console.log("Pausing video");
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Exception while toggling play:", error);
      if (onError) onError(new Error(`Exception in play/pause: ${error}`));
    }
  };

  return (
    <div className={cn("relative rounded-md overflow-hidden", className)}>
      {/* Use native HTML5 video with controls for reliability */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload={preload}
        playsInline={playsInline}
        className="w-full h-full"
        controls={true}
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
        onPlay={() => {
          console.log("Native video play event");
          setIsPlaying(true);
        }}
        onPause={() => {
          console.log("Native video pause event");
          setIsPlaying(false);
        }}
        onLoadedData={() => {
          console.log("Video data loaded");
          setLoading(false);
          if (onLoad) onLoad();
        }}
        onError={(e) => {
          console.error("Video error:", e);
          if (onError) onError(new Error("Video failed to load"));
        }}
      />
      
      {/* Simple overlay with loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}