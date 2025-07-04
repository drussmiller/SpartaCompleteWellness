import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";
import { createMediaUrl } from "@/lib/media-utils";

export function VideoPlayerPage() {
  const [location, setLocation] = useLocation();
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
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
      setIsLoading(false);
    } else {
      console.log('No video source found in URL parameters');
      setIsLoading(false);
    }
  }, []);

  const handleGoBack = () => {
    // Go back to home page since wouter doesn't have navigate(-1)
    setLocation('/');
  };

  const handleVideoError = (e: any) => {
    console.error('Video playback error:', e);
    setVideoError(true);
    setIsLoading(false);
  };

  const handleVideoLoad = () => {
    console.log('Video loaded successfully');
    setIsLoading(false);
    setVideoError(false);
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

  if (videoError) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <h1 className="text-xl mb-4">Error loading video</h1>
        <p className="mb-4">The video could not be loaded. Please try again.</p>
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
      <div className="absolute top-4 left-4 z-10">
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
      <div className="w-full h-screen flex items-center justify-center p-4">
        <video
          ref={videoRef}
          src={videoSrc}
          controls
          preload="auto"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          className="max-w-full max-h-full object-contain"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
          x-webkit-airplay="deny"
          onError={handleVideoError}
          onLoadedData={handleVideoLoad}
          onCanPlay={() => {
            console.log('Video can play');
            setIsLoading(false);
          }}
          onLoadStart={() => {
            console.log('Video load started');
          }}
          onLoadedMetadata={() => {
            console.log('Video metadata loaded');
          }}
        />
      </div>
    </div>
  );
}