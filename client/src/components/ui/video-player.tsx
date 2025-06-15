import React, { useState, useRef, useEffect } from 'react';
import { Play, X } from 'lucide-react';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);
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

  // Handle thumbnail click - Open modal
  const handleThumbnailClick = () => {
    console.log("Thumbnail clicked, opening modal video player");
    setIsModalOpen(true);
    
    // Small delay to ensure modal video element is created before trying to play
    setTimeout(() => {
      if (modalVideoRef.current) {
        console.log("Starting modal video playback");
        modalVideoRef.current.play()
          .then(() => {
            console.log("Modal video playback started successfully");
          })
          .catch(error => {
            console.error("Error playing modal video:", error);
            if (onError) onError(new Error(`Failed to play video: ${error.message}`));
          });
      }
    }, 100);
  };

  // Handle modal close
  const handleModalClose = () => {
    console.log("Closing modal video player");
    if (modalVideoRef.current) {
      modalVideoRef.current.pause();
    }
    setIsModalOpen(false);
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isModalOpen) {
        handleModalClose();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);
  
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
    <>
      <div 
        ref={containerRef}
        className={cn("relative", className)}
        style={{ margin: 0, padding: 0, lineHeight: 0 }}
      >
        {/* Show content based on current state */}
        <div className="relative w-full" style={{ height: '400px' }}>
          {/* Show blank placeholder first */}
          {showingBlankPlaceholder && (
            <div className="w-full h-full bg-gray-100 border border-gray-200"></div>
          )}
          
          {/* Show cropped thumbnail after placeholder, only when loaded */}
          {!showingBlankPlaceholder && thumbnailLoaded && simplifiedPoster && !posterError && (
            <>
              <img 
                src={simplifiedPoster} 
                alt="Video thumbnail" 
                className="w-full h-full object-cover cursor-pointer"
                onClick={handleThumbnailClick}
                style={{ 
                  display: 'block',
                  width: '600px',
                  maxWidth: '100%',
                  height: '400px',
                  objectFit: 'cover'
                }}
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
                className="w-full h-full flex flex-col items-center justify-center cursor-pointer"
                onClick={handleThumbnailClick}
                style={{
                  background: posterError ? 
                    "linear-gradient(to right, rgba(37, 99, 235, 0.1), rgba(124, 58, 237, 0.1))" : 
                    "white",
                  border: "1px solid #e5e7eb",
                  height: '400px'
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
      </div>

      {/* Modal Video Player */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[9999] bg-black bg-opacity-75 flex items-center justify-center"
          onClick={handleModalClose}
        >
          <div 
            className="relative bg-black rounded-lg overflow-hidden shadow-2xl max-w-4xl max-h-[90vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={handleModalClose}
              className="absolute top-4 right-4 z-10 p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-all"
            >
              <X size={24} />
            </button>
            
            {/* Modal video player */}
            <div className="w-full h-full flex items-center justify-center">
              <video
                ref={modalVideoRef}
                src={src}
                controls={true}
                playsInline={playsInline}
                controlsList={controlsList}
                disablePictureInPicture={disablePictureInPicture}
                className="max-w-full max-h-full"
                style={{
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: '80vh'
                }}
                onError={(e) => {
                  console.error("Modal video error:", e);
                  if (onError) onError(new Error("Failed to load video in modal"));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}