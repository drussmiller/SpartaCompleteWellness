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
      
      // Process the URL through createMediaUrl to handle Object Storage properly
      const processedSrc = createMediaUrl(decodedSrc);
      console.log('Video player page - processed src:', processedSrc);
      setVideoSrc(processedSrc);

      // Preload the video completely before showing anything
      const video = document.createElement('video');
      video.src = processedSrc;
      video.preload = 'auto';
      video.muted = true; // Required for autoplay on mobile
      
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      };
      
      video.oncanplaythrough = () => {
        console.log('Video fully loaded and ready to play');
        setIsLoading(false);
        setVideoReady(true);
        setShouldAutoPlay(true);
      };
      
      video.onerror = (e) => {
        console.error('Failed to load video:', processedSrc, e);
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
            playsInline
            webkit-playsinline="true"
            controlsList="nodownload nofullscreen noremoteplayback"
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
            x5-playsinline="true"
            x5-video-player-type="h5"
            x5-video-player-fullscreen="false"
            onError={(e) => {
              console.error('Video playback error:', e);
            }}
            onLoadStart={() => {
              // Prevent fullscreen on mobile
              const video = videoRef.current;
              if (video) {
                video.setAttribute('webkit-playsinline', 'true');
                video.setAttribute('playsinline', 'true');
                // Additional prevention for fullscreen
                video.removeAttribute('allowfullscreen');
                video.removeAttribute('webkitallowfullscreen');
                video.removeAttribute('mozallowfullscreen');
              }
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
              // Additional fullscreen prevention when metadata loads
              const video = videoRef.current;
              if (video) {
                // Override any fullscreen event listeners
                video.addEventListener('webkitbeginfullscreen', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }, { capture: true });
                
                video.addEventListener('fullscreenchange', (e) => {
                  if (document.fullscreenElement === video) {
                    document.exitFullscreen();
                  }
                }, { capture: true });

                // Additional prevention for webkit fullscreen
                video.addEventListener('webkitendfullscreen', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }, { capture: true });
              }
            }}
            onPlay={() => {
              console.log('Video started playing');
              // Prevent fullscreen on play
              const video = videoRef.current;
              if (video && document.fullscreenElement === video) {
                document.exitFullscreen();
              }
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