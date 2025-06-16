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
  const [showModal, setShowModal] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{width: number, height: number} | null>(null);
  const [isCalculatingDimensions, setIsCalculatingDimensions] = useState(false);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false); // Add isPreparingVideo state
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

  // Handle thumbnail click - open modal with video player
  const handleThumbnailClick = () => {
    if (isCalculatingDimensions || isPreparingVideo) return; // Prevent multiple clicks

    console.log("Thumbnail clicked, calculating video dimensions...");
    setIsCalculatingDimensions(true);

    // Create a temporary video element to get dimensions
    const tempVideo = document.createElement('video');
    tempVideo.src = src;
    tempVideo.preload = 'metadata';

    // Show loading state while calculating dimensions
    console.log("Loading video metadata to determine dimensions...");

    tempVideo.onloadedmetadata = () => {
      const videoWidth = tempVideo.videoWidth;
      const videoHeight = tempVideo.videoHeight;

      // Mobile-specific calculations
      const isMobile = window.innerWidth <= 768;
      const maxWidth = isMobile ? window.innerWidth * 0.95 : Math.min(window.innerWidth * 0.9, 800);
      const maxHeight = isMobile ? window.innerHeight * 0.8 : Math.min(window.innerHeight * 0.9, 600);

      let containerWidth = videoWidth;
      let containerHeight = videoHeight;

      // Always scale to fit viewport while maintaining aspect ratio
      const aspectRatio = videoWidth / videoHeight;

      // For mobile, prioritize width fitting first
      if (isMobile) {
        if (containerWidth > maxWidth) {
          containerWidth = maxWidth;
          containerHeight = containerWidth / aspectRatio;
        }

        // Then check if height needs adjustment
        if (containerHeight > maxHeight) {
          containerHeight = maxHeight;
          containerWidth = containerHeight * aspectRatio;
        }
      } else {
        // Desktop behavior - check both dimensions
        if (containerWidth > maxWidth || containerHeight > maxHeight) {
          if (containerWidth > maxWidth) {
            containerWidth = maxWidth;
            containerHeight = containerWidth / aspectRatio;
          }

          if (containerHeight > maxHeight) {
            containerHeight = maxHeight;
            containerWidth = containerHeight * aspectRatio;
          }
        }
      }

      console.log(`Video dimensions calculated: ${videoWidth}x${videoHeight}, Container: ${containerWidth}x${containerHeight}, Mobile: ${isMobile}`);

      // Set dimensions and immediately show modal with correct size
      setVideoDimensions({
        width: Math.round(containerWidth),
        height: Math.round(containerHeight)
      });
      
      setIsCalculatingDimensions(false);
      setShowModal(true);
      setShouldRenderVideo(true);

      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';

      // Show video immediately since dimensions are ready
      setVideoInitialized(true);
      setShowVideo(true);
      setIsPreparingVideo(true);

      // Start video playback after a brief moment
      setTimeout(() => {
        if (videoRef.current) {
          console.log("Starting video playback with pre-calculated dimensions");
          videoRef.current.play()
            .then(() => {
              console.log("Video playback started successfully");
            })
            .catch(error => {
              console.error("Error playing video:", error);
              if (onError) onError(new Error(`Failed to play video: ${error.message}`));
            })
            .finally(() => {
              setIsPreparingVideo(false);
            });
        } else {
          setIsPreparingVideo(false);
        }
      }, 100);

      // Clean up temp video
      tempVideo.remove();
    };

    tempVideo.onerror = () => {
      console.error("Failed to load video metadata, using fallback dimensions");
      // Fallback to default behavior if metadata loading fails
      const isMobile = window.innerWidth <= 768;
      setVideoDimensions({
        width: isMobile ? Math.round(window.innerWidth * 0.95) : 800,
        height: isMobile ? Math.round(window.innerHeight * 0.6) : 450
      });

      setIsCalculatingDimensions(false);
      setShowModal(true);
      setShouldRenderVideo(true);
      document.body.style.overflow = 'hidden';
      setVideoInitialized(true);
      setShowVideo(true);
      setIsPreparingVideo(false);

      tempVideo.remove();
    };
  };

  // Handle modal close
  const handleCloseModal = () => {
    setShowModal(false);
    setShowVideo(false);
    setShouldRenderVideo(false);
    setVideoInitialized(false);
    setVideoDimensions(null);
    setIsCalculatingDimensions(false);
    setIsPreparingVideo(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    // Re-enable body scroll
    document.body.style.overflow = 'unset';
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

  // Clean up body scroll on unmount
  useEffect(() => {
    return () => {
      // Restore body scroll if component unmounts while modal is open
      document.body.style.overflow = 'unset';
    };
  }, []);



  return (
    <div 
      ref={containerRef}
      className={cn("relative", className)}
      style={{ margin: 0, padding: 0, lineHeight: 0 }}
    >
      {/* Show content based on current state */}
      {!showVideo && (
        <div className="relative w-full h-full min-h-[200px]">
          {/* Show thumbnail if we have one */}
          {simplifiedPoster && !posterError && (
            <>
              <div 
                className="w-full cursor-pointer video-thumbnail-container"
                onClick={handleThumbnailClick}
                style={{ 
                  width: '100%',
                  maxWidth: '600px',
                  aspectRatio: '3/2',
                  overflow: 'hidden',
                  position: 'relative',
                  margin: '0 auto'
                }}
              >
                <img 
                  src={simplifiedPoster} 
                  alt="Video thumbnail" 
                  className="w-full h-full object-cover"
                  onLoad={handlePosterLoad}
                  onError={handlePosterError}
                  style={{ 
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center'
                  }}
                />
              </div>
              {/* Play button overlay on thumbnail */}
              <div className="absolute inset-0 flex items-end justify-start bg-black/10">
                <div 
                  className="p-2 m-3 rounded-full bg-black/60 cursor-pointer hover:bg-black/80"
                  onClick={handleThumbnailClick}
                  style={{ transition: 'none' }}
                >
                  {(isCalculatingDimensions || isPreparingVideo) ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Play size={24} className="text-white" fill="white" />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Show fallback if no poster or poster failed */}
          {(!simplifiedPoster || posterError) && (
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
              <div className="absolute inset-0 flex items-end justify-start bg-black/10">
                <div 
                  className="p-2 m-3 rounded-full bg-black/60 cursor-pointer hover:bg-black/80"
                  onClick={handleThumbnailClick}
                  style={{ transition: 'none' }}
                >
                  {(isCalculatingDimensions || isPreparingVideo) ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Play size={24} className="text-white" fill="white" />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal for video player */}
      {showModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999999,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0
          }}
          onClick={handleCloseModal}
        >
          <div 
            className="relative flex items-center justify-center"
            style={{
              width: videoDimensions ? `${videoDimensions.width}px` : 'min(95vw, 800px)',
              height: videoDimensions ? `${videoDimensions.height}px` : 'min(80vh, 450px)',
              maxWidth: window.innerWidth <= 768 ? '95vw' : '90vw',
              maxHeight: window.innerWidth <= 768 ? '80vh' : '90vh',
              zIndex: 999999,
              padding: window.innerWidth <= 768 ? '8px' : '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              key="close-button-v8"
              onClick={handleCloseModal}
              className="absolute p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-75 transition-all"
              style={{ 
                fontSize: '24px', 
                lineHeight: '1',
                zIndex: 999999,
                top: '-8px',
                left: '-8px'
              }}
            >
              ×
            </button>

            {/* Video player */}
            {shouldRenderVideo && videoInitialized && showVideo && (
              <video
                ref={videoRef}
                src={src}
                preload="none"
                playsInline={playsInline}
                className="w-full h-full object-contain"
                controls={true}
                controlsList={controlsList}
                disablePictureInPicture={disablePictureInPicture}
                style={{ 
                  width: "100%",
                  height: "100%"
                }}
              />
            )}


          </div>
        </div>
      )}


    </div>
  );
}