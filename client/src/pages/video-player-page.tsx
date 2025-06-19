import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Loader2 } from "lucide-react";

export function VideoPlayerPage() {
  const [location, setLocation] = useLocation();
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Extract video source from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const src = urlParams.get('src');

    console.log('Video player page - extracted src from URL:', src);

    if (!src) {
      setError("No video source provided");
      setIsLoading(false);
      return;
    }

    let decodedSrc = decodeURIComponent(src);
    console.log('Video player page - decoded src:', decodedSrc);

    // Clean up and construct the final video URL
    let finalVideoSrc: string;

    if (decodedSrc.startsWith('/api/serve-file')) {
      // Already a proper serve-file URL
      finalVideoSrc = decodedSrc;
    } else if (decodedSrc.includes('shared/uploads/')) {
      // Extract filename from path
      const filename = decodedSrc.split('shared/uploads/').pop() || decodedSrc.split('/').pop() || decodedSrc;
      finalVideoSrc = `/api/serve-file?filename=${encodeURIComponent(filename)}`;
    } else if (decodedSrc.includes('filename=')) {
      // Already has filename parameter, ensure it's properly formatted
      const urlParts = decodedSrc.split('?');
      const params = new URLSearchParams(urlParts[1] || '');
      const filename = params.get('filename');
      if (filename) {
        finalVideoSrc = `/api/serve-file?filename=${encodeURIComponent(filename)}`;
      } else {
        finalVideoSrc = decodedSrc;
      }
    } else {
      // Treat as filename directly
      const filename = decodedSrc.split('/').pop() || decodedSrc;
      finalVideoSrc = `/api/serve-file?filename=${encodeURIComponent(filename)}`;
    }

    console.log('Video player page - final video src:', finalVideoSrc);
    setVideoSrc(finalVideoSrc);
    setIsLoading(false);
  }, []);

  const handleGoBack = () => {
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

  if (error || !videoSrc) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <h1 className="text-xl mb-4">{error || "No video source provided"}</h1>
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
          className="text-white hover:bg-white/20 h-10 w-10"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      </div>

      {/* Video container */}
      <div className="w-full h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            preload="metadata"
            playsInline
            className="w-full h-auto max-h-[80vh] object-contain bg-black"
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: '80vh',
              objectFit: 'contain'
            }}
            onError={(e) => {
              console.error('Video playback error:', e);
              setError('Failed to load video');
            }}
            onLoadedMetadata={() => {
              console.log('Video metadata loaded successfully');
            }}
            onCanPlay={() => {
              console.log('Video can start playing');
            }}
          />
        </div>
      </div>
    </div>
  );
}