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
  const [loading, setLoading] = useState(true);
  const [posterError, setPosterError] = useState(false);
  const [thumbnailDimensions, setThumbnailDimensions] = useState<{width: number, height: number, aspectRatio: number} | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);

  // Handle thumbnail click - Facebook style implementation
  const handleThumbnailClick = () => {
    console.log("Thumbnail clicked, showing video player");
    
    // Log thumbnail dimensions before switching to video
    if (imageRef.current) {
      const thumbnailRect = imageRef.current.getBoundingClientRect();
      console.log("THUMBNAIL DIMENSIONS:", {
        width: thumbnailRect.width,
        height: thumbnailRect.height,
        naturalWidth: imageRef.current.naturalWidth,
        naturalHeight: imageRef.current.naturalHeight,
        aspectRatio: thumbnailRect.width / thumbnailRect.height
      });
    }
    
    setShowVideo(true);
    
    // Start video playback and log video dimensions after showing
    setTimeout(() => {
      if (videoRef.current && videoWrapperRef.current) {
        // Apply stored thumbnail dimensions to video wrapper first
        if (thumbnailDimensions) {
          videoWrapperRef.current.style.height = `${thumbnailDimensions.height}px`;
          videoWrapperRef.current.style.aspectRatio = `${thumbnailDimensions.aspectRatio}`;
          console.log("APPLIED THUMBNAIL DIMENSIONS TO VIDEO:", {
            width: thumbnailDimensions.width,
            height: thumbnailDimensions.height,
            aspectRatio: thumbnailDimensions.aspectRatio
          });
        }
        
        const videoRect = videoRef.current.getBoundingClientRect();
        const wrapperRect = videoWrapperRef.current.getBoundingClientRect();
        
        console.log("VIDEO PLAYER DIMENSIONS:", {
          videoElement: {
            width: videoRect.width,
            height: videoRect.height,
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
            aspectRatio: videoRect.width / videoRect.height
          },
          videoWrapper: {
            width: wrapperRect.width,
            height: wrapperRect.height,
            aspectRatio: wrapperRect.width / wrapperRect.height
          }
        });
        
        console.log("DIMENSION COMPARISON:", {
          thumbnailSize: thumbnailDimensions ? `${thumbnailDimensions.width}x${thumbnailDimensions.height}` : 'unknown',
          videoWrapperSize: `${wrapperRect.width}x${wrapperRect.height}`,
          videoElementSize: `${videoRect.width}x${videoRect.height}`,
          heightMatch: thumbnailDimensions ? Math.abs(thumbnailDimensions.height - wrapperRect.height) < 2 : false
        });
        
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
  
  // Handle poster image load error - no fallbacks as requested by user
  const handlePosterError = () => {
    console.warn("Poster image failed to load:", simplifiedPoster);
    // As requested by user, no fallback images or alternatives - just fail silently
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
  
  // Listen for thumbnail regeneration events
  useEffect(() => {
    if (!src) return;
    
    const handleThumbnailRegenerated = (event: Event) => {
      const customEvent = event as CustomEvent<{ videoUrl: string }>;
      
      // Check if this event is for our video
      if (customEvent.detail?.videoUrl === src) {
        console.log('Thumbnail regenerated for this video, refreshing poster');
        
        // Reset poster error state
        setPosterError(false);
        
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
      {/* Thumbnail image that gets clicked to start the video */}
      {!showVideo && (
        <div className="bg-gray-800 video-thumbnail-container">
          {/* Always render img if we have a poster - no longer hiding on errors */}
          {simplifiedPoster && (
            <img 
              ref={imageRef}
              src={simplifiedPoster} 
              alt="Video thumbnail" 
              className="cursor-pointer video-thumbnail-image"
              onLoad={(e) => {
                console.log('Video thumbnail loaded successfully');
                // Force container to match image aspect ratio
                const img = e.target as HTMLImageElement;
                const container = img.closest('.video-thumbnail-container') as HTMLElement;
                if (container && img.naturalWidth && img.naturalHeight) {
                  const aspectRatio = img.naturalWidth / img.naturalHeight;
                  const containerWidth = container.offsetWidth;
                  const calculatedHeight = containerWidth / aspectRatio;
                  
                  // Store dimensions for video player use
                  setThumbnailDimensions({
                    width: containerWidth,
                    height: calculatedHeight,
                    aspectRatio: aspectRatio
                  });
                  
                  // Apply dimensions directly to container
                  container.style.height = `${calculatedHeight}px`;
                  container.style.aspectRatio = `${aspectRatio}`;
                  
                  console.log(`Image natural dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
                  console.log(`Container forced to: ${containerWidth}x${calculatedHeight}`);
                  console.log(`Aspect ratio: ${aspectRatio}`);
                }
              }}
              onClick={handleThumbnailClick}
              onError={handlePosterError}
            />
          )}
          {/* Show fallback only if no poster URL at all */}
          {!simplifiedPoster && (
            /* Only show the gradient fallback as a visual cue for debugging - hide in production */
            <div 
              className="w-full min-h-[300px] flex flex-col items-center justify-center cursor-pointer"
              onClick={handleThumbnailClick}
              style={{
                background: posterError ? 
                  "linear-gradient(to right, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.1))" : 
                  "black"
              }}
            >
              <div className="p-4 rounded-lg flex flex-col items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </div>
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
      <div ref={videoWrapperRef} className={cn("w-full video-wrapper", showVideo ? "block" : "hidden")}>
        <video
          ref={videoRef}
          src={src}
          preload={preload}
          playsInline={playsInline}
          className="w-full h-auto object-contain"
          controls={true}
          controlsList={controlsList}
          disablePictureInPicture={disablePictureInPicture}
          style={{ 
            maxHeight: "none", 
            width: "100%"
          }}
        />
      </div>
      
      {/*  Loading indicator - only shown when video is visible and loading */}
      {showVideo && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}