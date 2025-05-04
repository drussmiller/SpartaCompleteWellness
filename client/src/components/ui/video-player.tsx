import React, { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';
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
  disablePictureInPicture = true,
  controlsList = 'nodownload'
}: VideoPlayerProps) {
  // Try to get video poster if it's a MOV file
  const videoPoster = src?.toLowerCase().endsWith('.mov') ? getVideoPoster(src) : undefined;
  const poster = videoPoster || initialPoster;
  
  const [showVideo, setShowVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle thumbnail click - Facebook style implementation
  const handleThumbnailClick = () => {
    console.log("Thumbnail clicked, showing video player");
    setShowVideo(true);
    
    // Start video playback after showing
    setTimeout(() => {
      if (videoRef.current) {
        console.log("Starting video playback");
        videoRef.current.play()
          .then(() => {
            console.log("Video playback started successfully");
          })
          .catch(error => {
            console.error("Error playing video:", error);
            if (onError) onError(new Error(`Failed to play video: ${error.message}`));
          });
      }
    }, 50);
  };
  
  // Set up video loaded event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleVideoLoaded = () => {
      console.log("Video data loaded");
      setLoading(false);
      if (onLoad) onLoad();
    };
    
    const handleError = () => {
      console.error("Video load error");
      if (onError) onError(new Error("Video failed to load"));
    };
    
    video.addEventListener('loadeddata', handleVideoLoaded);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('loadeddata', handleVideoLoaded);
      video.removeEventListener('error', handleError);
    };
  }, [onLoad, onError]);

  return (
    <div 
      ref={containerRef}
      className={cn("relative rounded-md overflow-hidden", className)}
    >
      {/* Thumbnail image that gets clicked to start the video */}
      {!showVideo && (
        <div className="relative w-full">
          <img 
            src={poster} 
            alt="Video thumbnail" 
            className="w-full h-full object-contain cursor-pointer"
            onClick={handleThumbnailClick}
          />
          
          {/* Play button overlay on thumbnail */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <div 
              className="p-4 rounded-full bg-black/40 cursor-pointer hover:bg-black/60 transition-colors"
              onClick={handleThumbnailClick}
            >
              <Play size={40} className="text-white" fill="white" />
            </div>
          </div>
        </div>
      )}
      
      {/* Video player (initially hidden) */}
      <video
        ref={videoRef}
        src={src}
        preload={preload}
        playsInline={playsInline}
        className={cn(
          "w-full h-full object-contain",
          showVideo ? "block" : "hidden"
        )}
        controls={true}
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
      />
      
      {/* Loading indicator - only shown when video is visible and loading */}
      {showVideo && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}