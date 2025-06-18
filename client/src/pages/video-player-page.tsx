import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";

export function VideoPlayerPage() {
  const [location, setLocation] = useLocation();
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{width: number, height: number} | null>(null);

  useEffect(() => {
    // Extract video source from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const src = urlParams.get('src');

    console.log('Video player page - extracted src from URL:', src);

    if (src) {
      const decodedSrc = decodeURIComponent(src);
      console.log('Video player page - decoded src:', decodedSrc);
      setVideoSrc(decodedSrc);

      // Preload the video completely before showing anything
      const video = document.createElement('video');
      video.src = decodedSrc;
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
            src={videoSrc}
            controls
            autoPlay={shouldAutoPlay}
            muted={shouldAutoPlay} // Required for autoplay
            preload="auto"
            playsInline
            width={videoDimensions.width}
            height={videoDimensions.height}
            className="max-w-full max-h-full object-contain"
            style={{
              width: 'auto',
              height: 'auto',
              maxWidth: '100%',
              maxHeight: '100%'
            }}
            onPlay={() => {
              console.log('Video started playing');
            }}
            onError={(e) => {
              console.error('Video playback error:', e);
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