import React, { useState, useRef, useEffect } from 'react';
import { Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAlternativePosterUrls, getVideoPoster } from '@/lib/memory-verse-utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const [showingBlankPlaceholder, setShowingBlankPlaceholder] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize thumbnail loading
  useEffect(() => {
    setShowingBlankPlaceholder(false);
    setThumbnailLoaded(false);

    if (!simplifiedPoster) {
      // If no poster, mark as loaded (will show nothing due to removed fallback)
      setThumbnailLoaded(true);
    }
    // If we have a poster, thumbnailLoaded will be set by onLoad event
  }, [simplifiedPoster]);

  // Detect if device is Android
  const isAndroid = /Android/i.test(navigator.userAgent);

  // Handle thumbnail click - open video dialog overlay
  const handleThumbnailClick = () => {
    console.log("Thumbnail clicked, opening video player dialog");
    setIsDialogOpen(true);
    
    // Small delay to ensure video element is rendered before attempting play
    setTimeout(() => {
      if (videoRef.current) {
        console.log("Attempting to play video after dialog open");
        
        // On Android, request fullscreen on the video element itself
        if (isAndroid && videoRef.current.requestFullscreen) {
          videoRef.current.requestFullscreen().catch(error => {
            console.log('Fullscreen request failed:', error);
          });
        }
        
        videoRef.current.play().catch(error => {
          console.log('Initial play attempt failed:', error);
        });
      }
    }, 100);
  };

  // Handle dialog close
  const handleDialogClose = () => {
    console.log("Video player dialog closed");
    setIsDialogOpen(false);
    
    // Pause video when closing dialog
    if (videoRef.current) {
      videoRef.current.pause();
    }
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
    <>
      <div 
        ref={containerRef}
        className={cn("relative", className)}
        style={{ margin: 0, padding: 0, lineHeight: 0 }}
      >
        {/* Show content based on current state */}
        {!showVideo && (
          <div className="relative w-full h-full min-h-[200px]">
            {/* No blank placeholder - removed per user request */}

            {/* Show thumbnail after placeholder, only when loaded */}
            {!showingBlankPlaceholder && thumbnailLoaded && simplifiedPoster && !posterError && (
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
                    <Play size={24} className="text-white" fill="white" />
                  </div>
                </div>
              </>
            )}

            {/* No fallback - if poster fails, show nothing */}

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
      </div>

      {/* Video Player Dialog Overlay */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} modal>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full p-0 bg-black border-0" style={{ zIndex: 2147483647 }}>
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Close button */}
            <Button
              onClick={handleDialogClose}
              variant="ghost"
              size="icon"
              className="absolute top-4 left-4 z-50 text-white hover:bg-white/20 !h-10 !w-10"
              data-testid="button-close-video"
            >
              <X className="!h-8 !w-8" />
            </Button>

            {/* Video player */}
            <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              playsInline
              preload="auto"
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture={false}
              disableRemotePlayback
              className="max-w-full max-h-full object-contain"
              style={{
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              onLoadStart={() => {
                console.log('Video load started:', src);
              }}
              onProgress={() => {
                console.log('Video buffering progress');
              }}
              onError={(e) => {
                console.error('Video playback error:', e);
                const target = e.currentTarget as HTMLVideoElement;
                if (target.error) {
                  console.error('Video error code:', target.error.code);
                  console.error('Video error message:', target.error.message);
                }
                if (onError) onError(new Error('Video failed to play'));
              }}
              onLoadedData={() => {
                console.log('Video loaded successfully');
                if (onLoad) onLoad();
              }}
              onLoadedMetadata={() => {
                console.log('Video metadata loaded');
              }}
              onStalled={() => {
                console.warn('Video playback stalled');
              }}
              onSuspend={() => {
                console.warn('Video loading suspended');
              }}
              onWaiting={() => {
                console.warn('Video waiting for data');
              }}
              onCanPlay={() => {
                console.log('Video can play');
                // Ensure autoplay starts when video is ready
                if (videoRef.current) {
                  console.log('Attempting to play video via onCanPlay');
                  
                  // On Android, request fullscreen on the video element
                  if (isAndroid && videoRef.current.requestFullscreen) {
                    videoRef.current.requestFullscreen().catch(error => {
                      console.log('Fullscreen request on canPlay failed:', error);
                    });
                  }
                  
                  videoRef.current.play().catch(error => {
                    console.log('Autoplay was prevented:', error);
                    // On mobile, autoplay might be blocked - user can still use controls
                  });
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}