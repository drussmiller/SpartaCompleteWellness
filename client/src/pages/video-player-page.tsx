
import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function VideoPlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const videoSrc = searchParams.get('src');
  const posterSrc = searchParams.get('poster');
  
  useEffect(() => {
    if (!videoSrc) {
      navigate('/');
      return;
    }
    
    // Auto-play video when page loads
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => {
          console.log("Video playback started successfully");
          setIsLoading(false);
        })
        .catch(error => {
          console.error("Error playing video:", error);
          setIsLoading(false);
        });
    }
  }, [videoSrc, navigate]);
  
  const handleGoBack = () => {
    navigate(-1);
  };
  
  if (!videoSrc) {
    return null;
  }
  
  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4 bg-black/80 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGoBack}
          className="text-white hover:bg-white/20"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGoBack}
          className="text-white hover:bg-white/20 text-xl px-3"
        >
          ×
        </Button>
      </div>
      
      {/* Video container */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          {isLoading && (
            <div className="flex items-center justify-center h-96">
              <div className="text-white text-lg">Loading video...</div>
            </div>
          )}
          
          <video
            ref={videoRef}
            src={decodeURIComponent(videoSrc)}
            poster={posterSrc ? decodeURIComponent(posterSrc) : undefined}
            className="w-full h-auto max-h-[80vh] object-contain"
            controls={true}
            playsInline
            controlsList="nodownload"
            disablePictureInPicture
            onLoadedData={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
            style={{
              backgroundColor: 'transparent',
              display: isLoading ? 'none' : 'block'
            }}
          />
        </div>
      </div>
    </div>
  );
}
