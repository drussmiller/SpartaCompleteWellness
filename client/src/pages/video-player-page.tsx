import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";

export function VideoPlayerPage() {
  const [location, setLocation] = useLocation();
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    // Extract video source from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const src = urlParams.get('src');

    console.log('Video player page - extracted src from URL:', src);

    if (src) {
      const decodedSrc = decodeURIComponent(src);
      console.log('Video player page - decoded src:', decodedSrc);
      setVideoSrc(decodedSrc);

      // Preload the video to check if it's valid
      const video = document.createElement('video');
      video.src = decodedSrc;
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded successfully');
        setIsLoading(false);
      };
      video.oncanplay = () => {
        console.log('Video can start playing');
        setVideoReady(true);
      };
      video.onerror = (e) => {
        console.error('Failed to load video:', decodedSrc, e);
        setIsLoading(false);
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
        {!videoReady && (
          <div className="flex items-center justify-center text-white">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Preparing video...</span>
          </div>
        )}
        <video
          src={videoSrc}
          controls={videoReady}
          autoPlay={videoReady}
          preload="metadata"
          className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
            videoReady ? 'opacity-100' : 'opacity-0 absolute'
          }`}
          onLoadedMetadata={() => {
            console.log('Video metadata loaded');
          }}
          onCanPlay={() => {
            console.log('Video can play - showing player');
            setVideoReady(true);
          }}
          onError={(e) => {
            console.error('Video playback error:', e);
            setVideoReady(true); // Show even if there's an error
          }}
        />
      </div>
    </div>
  );
}