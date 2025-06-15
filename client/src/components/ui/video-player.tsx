import React, { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAlternativePosterUrls, getVideoPoster } from '@/lib/memory-verse-utils';
import './video-player.css'; // Import the custom CSS

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
 * This function also generates alternative paths to try if the main one fails
 */
function createSimplifiedPosterUrl(originalUrl?: string): string | undefined {
  if (!originalUrl) return undefined;
  
  console.log('createSimplifiedPosterUrl called with:', originalUrl);
  
  // Don't process if it's already a data URL
  if (originalUrl.startsWith('data:')) return originalUrl;
  
  try {
    // Now handle clean URLs without nesting
    
    // For JPG files, the URL is already correct
    if (originalUrl.includes('.jpg')) {
      console.log('Video player: URL already has correct JPG format:', originalUrl);
      return originalUrl;
    }
    
    // If URL contains .mov or any other video extension, it should already be handled by getVideoPoster
    if (originalUrl.toLowerCase().match(/\.(mov|mp4|webm|avi|mkv)$/i)) {
      console.log('Video player: Video URL detected, returning as-is:', originalUrl);
      return originalUrl;
    }
    
    console.log('Video player returning original URL unchanged:', originalUrl);
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
  const [posterError, setPosterError] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [videoInitialized, setVideoInitialized] = useState(false);
  const [shouldRenderVideo, setShouldRenderVideo] = useState(false);
  const [showingBlankPlaceholder, setShowingBlankPlaceholder] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize with blank placeholder, then load thumbnail
  useEffect(() => {
    // Start with blank placeholder for a brief moment
    setShowingBlankPlaceholder(true);
    setThumbnailLoaded(false);
    
    // After a brief delay, start loading the thumbnail
    const timer = setTimeout(() => {
      setShowingBlankPlaceholder(false);
      
      if (!simplifiedPoster) {
        // If no poster, show fallback immediately
        setThumbnailLoaded(true);
      }
      // If we have a poster, thumbnailLoaded will be set by onLoad event
    }, 100); // Very brief delay to prevent video flash
    
    return () => clearTimeout(timer);
  }, [simplifiedPoster]);

  // Handle thumbnail click - Facebook style implementation
  const handleThumbnailClick = () => {
    console.log("Thumbnail clicked, initializing video player");
    setShouldRenderVideo(true);
    
    // Small delay to ensure video element is created before trying to play
    setTimeout(() => {
      setVideoInitialized(true);
      setShowVideo(true);
      
      // Start video playback immediately after video element is rendered
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
      }, 100);
    }, 50);
  };
  
  // Handle poster image load success
  const handlePosterLoad = () => {
    console.log("Poster image loaded successfully:", simplifiedPoster);
    setThumbnailLoaded(true);
  };

  // Handle poster image load error - no fallbacks as requested by user
  const handlePosterError = () => {
    console.warn("Poster image failed to load:", simplifiedPoster);
    setPosterError(true);
    setThumbnailLoaded(true); // Still show fallback
    // As requested by user, no fallback images or alternatives - just fail silently
  };
  
  // Set up video loaded event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleVideoLoaded = () => {
      console.log("Video data loaded");
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
  
  // Listen for thumbnail regeneration events
  useEffect(() => {
    if (!src) return;
    
    const handleThumbnailRegenerated = (event: Event) => {
      const customEvent = event as CustomEvent<{ videoUrl: string }>;
      
      // Check if this event is for our video
      if (customEvent.detail?.videoUrl === src) {
        console.log('Thumbnail regenerated for this video, refreshing poster');
        
        // Reset poster error state and thumbnail loaded state
        setPosterError(false);
        setThumbnailLoaded(false);
        
        // Add a cache-busting timestamp to force a reload of the image
        if (simplifiedPoster) {
          const timestamp = Date.now();
          const refreshedPoster = simplifiedPoster.includes('?') 
            ? simplifiedPoster.replace(/(\?|&)v=\d+/, `$1v=${timestamp}`)
            : `${simplifiedPoster}?v=${timestamp}`;
            
          console.log('Refreshing poster with URL:', refreshedPoster);
          setSimplifiedPoster(refreshedPoster);
        }
        // If no poster was set, try to generate one from the video URL
        else if (src) {
          // Use imported getVideoPoster directly
          const newPoster = getVideoPoster(src);
          
          if (newPoster) {
            console.log('Setting new poster URL after regeneration:', newPoster);
            setSimplifiedPoster(newPoster);
          }
        }
      }
    };
    
    // Add event listener for thumbnail-regenerated custom event
    window.addEventListener('thumbnail-regenerated', handleThumbnailRegenerated);
    
    return () => {
      window.removeEventListener('thumbnail-regenerated', handleThumbnailRegenerated);
    };
  }, [src, simplifiedPoster]);



  return (
    <div 
      ref={containerRef}
      className={cn("relative", className)}
      style={{ margin: 0, padding: 0, lineHeight: 0 }}
    >
      {/* Show content based on current state */}
      {!showVideo && (
        <div className="relative w-full h-full min-h-[200px]">
          {/* Show blank placeholder first */}
          {showingBlankPlaceholder && (
            <div className="w-full h-full min-h-[200px] bg-gray-100 border border-gray-200"></div>
          )}
          
          {/* Show thumbnail after placeholder, only when loaded */}
          {!showingBlankPlaceholder && thumbnailLoaded && simplifiedPoster && !posterError && (
            <>
              <img 
                src={simplifiedPoster} 
                alt="Video thumbnail" 
                className="w-full h-full object-cover cursor-pointer"
                onClick={handleThumbnailClick}
                style={{ display: 'block' }}
              />
              {/* Play button overlay on thumbnail */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div 
                  className="p-4 rounded-full bg-black/40 cursor-pointer hover:bg-black/60"
                  onClick={handleThumbnailClick}
                  style={{ transition: 'none' }}
                >
                  <Play size={40} className="text-white" fill="white" />
                </div>
              </div>
            </>
          )}
          
          {/* Show fallback if no poster or poster failed, but not during blank placeholder */}
          {!showingBlankPlaceholder && thumbnailLoaded && (!simplifiedPoster || posterError) && (
            <>
              <div 
                className="w-full h-full min-h-[200px] flex flex-col items-center justify-center cursor-pointer"
                onClick={handleThumbnailClick}
                style={{
                  background: posterError ? 
                    "linear-gradient(to right, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.1))" : 
                    "white",
                  border: "1px solid #e5e7eb"
                }}
              >
                <div className="p-4 rounded-lg flex flex-col items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </div>
              </div>
              {/* Play button overlay on fallback */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <div 
                  className="p-4 rounded-full bg-black/40 cursor-pointer hover:bg-black/60"
                  onClick={handleThumbnailClick}
                  style={{ transition: 'none' }}
                >
                  <Play size={40} className="text-white" fill="white" />
                </div>
              </div>
            </>
          )}
          
          {/* Loading thumbnail (hidden image to trigger load) */}
          {!showingBlankPlaceholder && !thumbnailLoaded && simplifiedPoster && (
            <img 
              src={simplifiedPoster} 
              alt="Video thumbnail" 
              onLoad={handlePosterLoad}
              onError={handlePosterError}
              style={{ display: 'none' }}
            />
          )}
        </div>
      )}
      
      {/* Video player (only rendered after thumbnail is clicked) */}
      {shouldRenderVideo && videoInitialized && (
        <div className="w-full h-full video-wrapper" style={{ minHeight: "315px" }}>
          <video
            ref={videoRef}
            src={src}
            preload="none"
            playsInline={playsInline}
            className="w-full h-full object-contain" /* Ensure video fills container properly */
            controls={true}
            controlsList={controlsList}
            disablePictureInPicture={disablePictureInPicture}
            style={{ 
              maxHeight: "none", 
              width: "100%",
              height: "315px", // Set explicit height to match 16:9 aspect ratio for 560px width
              opacity: showVideo ? 1 : 0,
              transition: "opacity 0.1s ease-in"
            }}
            onCanPlay={() => setShowVideo(true)}
          />
        </div>
      )}
      
      
    </div>
  );
}