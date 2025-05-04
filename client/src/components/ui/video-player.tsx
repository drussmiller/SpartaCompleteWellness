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

/**
 * Creates a simplified poster URL for Windows compatibility
 * Windows can have issues with complex paths with multiple segments
 */
function createSimplifiedPosterUrl(originalUrl?: string): string | undefined {
  if (!originalUrl) return undefined;
  
  // Don't process if it's already a data URL
  if (originalUrl.startsWith('data:')) return originalUrl;
  
  try {
    // If it's a direct-download URL, extract the fileUrl parameter
    if (originalUrl.includes('/api/object-storage/direct-download')) {
      const url = new URL(originalUrl, window.location.origin);
      const fileUrl = url.searchParams.get('fileUrl');
      if (!fileUrl) return originalUrl;
      
      // Extract just the filename without the path
      const filename = fileUrl.split('/').pop();
      if (!filename) return originalUrl;
      
      // Create a simpler URL for the thumbnail
      return `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${filename}`;
    }
    
    // For other URLs, try to simplify the path if it has poster.jpg
    if (originalUrl.includes('.poster.jpg')) {
      const parts = originalUrl.split('/');
      const filename = parts.pop();
      if (!filename) return originalUrl;
      
      // Create a more direct path to the thumbnail
      return `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${filename}`;
    }
    
    return originalUrl;
  } catch (error) {
    console.error("Error simplifying poster URL:", error);
    return originalUrl;
  }
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
  // Try to get video poster using different strategies
  const videoPoster = src?.toLowerCase().endsWith('.mov') ? getVideoPoster(src) : undefined;
  const poster = videoPoster || initialPoster;
  
  // Handle Windows compatibility issues with complex paths
  const [simplifiedPoster, setSimplifiedPoster] = useState<string | undefined>(
    createSimplifiedPosterUrl(poster)
  );
  
  const [showVideo, setShowVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posterError, setPosterError] = useState(false);
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
  
  // Handle poster image load error
  const handlePosterError = () => {
    console.warn("Poster image failed to load:", simplifiedPoster);
    setPosterError(true);
    
    // Try to create an alternate URL by simplifying it further
    if (simplifiedPoster && simplifiedPoster.includes('thumb-')) {
      // Try alternate naming format without the 'thumb-' prefix
      const altPoster = simplifiedPoster.replace('thumb-', '');
      console.log("Trying alternate poster URL:", altPoster);
      setSimplifiedPoster(altPoster);
    } else if (simplifiedPoster && simplifiedPoster.includes('.poster.jpg')) {
      // Try using the base filename without .poster.jpg
      const basePoster = simplifiedPoster.replace('.poster.jpg', '.jpg');
      console.log("Trying base poster URL:", basePoster);
      setSimplifiedPoster(basePoster);
    }
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
        <div className="relative w-full h-full min-h-[200px] bg-gray-800">
          {/* Only render img if we have a valid poster and no error */}
          {simplifiedPoster && !posterError ? (
            <img 
              src={simplifiedPoster} 
              alt="Video thumbnail" 
              className="w-full h-full object-contain cursor-pointer"
              onClick={handleThumbnailClick}
              onError={handlePosterError}
            />
          ) : (
            /* Fallback for when poster fails to load */
            <div 
              className="w-full h-full min-h-[200px] bg-gray-800 flex items-center justify-center"
              onClick={handleThumbnailClick}
            >
              <div className="text-white text-sm mb-8">Video Preview</div>
            </div>
          )}
          
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