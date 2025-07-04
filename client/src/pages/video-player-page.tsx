import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";
import { createMediaUrl } from "@/lib/media-utils";

export function VideoPlayerPage() {
  const [location, setLocation] = useLocation();
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{width: number, height: number} | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Extract video source from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const src = urlParams.get('src');

    console.log('Video player page - extracted src from URL:', src);

    if (src) {
      const decodedSrc = decodeURIComponent(src);
      console.log('Video player page - decoded src:', decodedSrc);
      
      // Use createMediaUrl to ensure proper Object Storage URL formatting
      const mediaUrl = createMediaUrl(decodedSrc);
      console.log('Video player page - using media URL:', mediaUrl);
      setVideoSrc(mediaUrl);

      // Generate thumbnail for the video if it doesn't exist
      const generateThumbnailIfNeeded = async () => {
        try {
          // Extract filename from the video URL
          let filename = '';
          if (decodedSrc.includes('filename=')) {
            const urlParams = new URLSearchParams(decodedSrc.split('?')[1]);
            filename = urlParams.get('filename') || '';
          } else {
            filename = decodedSrc.split('/').pop() || '';
          }

          if (filename) {
            console.log('Checking thumbnail for video:', filename);
            
            // Try to request thumbnail generation
            const response = await fetch('/api/generate-thumbnail', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ videoUrl: decodedSrc })
            });

            if (response.ok) {
              console.log('Thumbnail generation requested successfully');
            } else {
              console.warn('Thumbnail generation failed:', response.status);
            }
          }
        } catch (error) {
          console.error('Error requesting thumbnail generation:', error);
        }
      };

      // Start thumbnail generation in the background
      generateThumbnailIfNeeded();

      // Preload only metadata for faster startup
      const video = document.createElement('video');
      video.src = decodedSrc;
      video.preload = 'metadata';
      video.muted = true; // Required for autoplay on mobile
      
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      };
      
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, ready to start');
        setIsLoading(false);
        setVideoReady(true);
        setShouldAutoPlay(true);
      };
      
      video.onerror = (e) => {
        console.error('Failed to load video:', decodedSrc, e);
        setIsLoading(false);
        setVideoReady(false); // Don't show video on error
      };
      
      video.load();
    } else {
      console.log('No video source found in URL parameters');
      setIsLoading(false);
    }
  }, []);

  const handleGoBack = () => {
    // Go back to home page since wouter doesn't have navigate(-1)
    setLocation('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading video...</span>
        </div>
      </div>
    );
  }

  if (!videoSrc) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <h1 className="text-xl mb-4">No video source provided</h1>
        <Button onClick={handleGoBack} variant="outline">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* Header with back button */}
      <div className="absolute top-16 left-4 z-10">
        <Button
          onClick={handleGoBack}
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20 !h-10 !w-10"
        >
          <ChevronLeft className="!h-8 !w-8" />
        </Button>
      </div>

      {/* Video container */}
      <div className="w-full h-screen flex items-center justify-center pt-20">
        {isLoading && (
          <div className="flex items-center justify-center text-white">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Loading video...</span>
          </div>
        )}
        {!isLoading && videoReady && videoDimensions && (
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            preload="auto"
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            width={videoDimensions.width}
            height={videoDimensions.height}
            className="max-w-full max-h-full object-contain"
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
            x-webkit-airplay="deny"
            onError={(e) => {
              console.error('Video playback error:', e);
            }}
            onCanPlay={() => {
              // Auto-play when the video can start playing
              if (shouldAutoPlay && videoRef.current) {
                console.log('Attempting auto-play...');
                videoRef.current.play().catch(e => {
                  console.log('Auto-play failed, user interaction required:', e);
                });
                setShouldAutoPlay(false); // Only try once
              }
            }}
            onLoadedMetadata={() => {
              // Handle fullscreen events - close player when exiting fullscreen
              const video = videoRef.current;
              if (video) {
                // When fullscreen ends, close the video player
                video.addEventListener('webkitendfullscreen', () => {
                  console.log('Exiting fullscreen - closing video player');
                  handleGoBack();
                }, { capture: true });
                
                video.addEventListener('fullscreenchange', () => {
                  if (!document.fullscreenElement) {
                    console.log('Exiting fullscreen - closing video player');
                    handleGoBack();
                  }
                }, { capture: true });
              }
            }}
            onPlay={() => {
              console.log('Video started playing');
            }}
          />
        )}
        {!isLoading && !videoReady && (
          <div className="flex items-center justify-center text-white">
            <span>Unable to load video</span>
          </div>
        )}
      </div>
    </div>
  );
}