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
      let decodedSrc = decodeURIComponent(src);
      console.log('Video player page - decoded src:', decodedSrc);

      // Handle different URL formats and ensure proper video serving
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

      // Test video accessibility first
      const testVideo = () => {
        fetch(finalVideoSrc, { method: 'HEAD' })
          .then(response => {
            console.log('Video HEAD request response:', response.status, response.headers.get('content-type'));
            if (response.ok) {
              // Video is accessible, proceed with loading
              const video = document.createElement('video');
              video.src = finalVideoSrc;
              video.preload = 'metadata';
              video.muted = true;

              video.onloadedmetadata = () => {
                console.log('Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
                setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
                setVideoReady(true);
                setIsLoading(false);
                setShouldAutoPlay(true);
              };

              video.oncanplay = () => {
                console.log('Video can start playing');
                if (!videoReady) {
                  setVideoReady(true);
                  setIsLoading(false);
                }
              };

              video.onerror = (e) => {
                console.error('Video load error:', e);
                console.error('Video error details:', {
                  error: e,
                  videoError: video.error,
                  networkState: video.networkState,
                  readyState: video.readyState,
                  src: finalVideoSrc
                });
                setIsLoading(false);
                setVideoReady(false);
              };

              video.load();
            } else {
              console.error('Video not accessible:', response.status, response.statusText);
              setIsLoading(false);
              setVideoReady(false);
            }
          })
          .catch(error => {
            console.error('Error testing video accessibility:', error);
            setIsLoading(false);
            setVideoReady(false);
          });
      };

      // Test video with a small delay to ensure server is ready
      setTimeout(testVideo, 100);
    } else {
      console.log('No video source found in URL parameters');
      setIsLoading(false);
    }
  }, [videoReady]);

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
          <div className="flex flex-col items-center justify-center text-white text-center p-4">
            <h2 className="text-xl mb-4">Unable to load video</h2>
            <p className="text-gray-300 mb-4">The video file could not be loaded or found.</p>
            <p className="text-sm text-gray-400 mb-4">Video URL: {videoSrc}</p>
            <Button onClick={handleGoBack} variant="outline">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}