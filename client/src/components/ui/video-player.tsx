import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleFailedPosterLoad, getVideoPoster } from '@/lib/memory-verse-utils';

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

export function VideoPlayer({
  src,
  poster: initialPoster,
  className,
  preload = 'metadata',
  playsInline = true,
  onError,
  onLoad,
  disablePictureInPicture = false,
  controlsList = 'nodownload'
}: VideoPlayerProps) {
  // Try to get video poster if it's a MOV file using the more general utility function
  const videoPoster = src?.toLowerCase().endsWith('.mov') 
    ? getVideoPoster(src) 
    : undefined;
  
  // Use automatically detected poster as default if available, otherwise use provided poster
  const poster = videoPoster || initialPoster;
  
  // Add key based on poster URL to force re-render when poster changes
  const key = `video-${src?.split('/').pop()}-${poster ? Date.now() : 'no-poster'}`;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Log if we're using an auto-detected poster
  useEffect(() => {
    if (videoPoster) {
      console.log("Using auto-detected video poster:", videoPoster);
    }
  }, [videoPoster]);

  // Show controls when mouse moves over the video - Facebook style
  const showControls = () => {
    setControlsVisible(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Hide controls after 2.5 seconds if video is playing (Facebook behavior)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2500);
    }
  };

  // Handle play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(err => {
        console.error("Error playing video:", err);
        if (onError) onError(err);
      });
    }
  };
  
  // Log when poster loads or fails to help with debugging
  const handlePosterLoaded = () => {
    console.log("Video poster loaded successfully:", poster);
  };
  
  const handlePosterError = async () => {
    console.error("Failed to load video poster:", poster);
    
    // Try to generate a thumbnail using our memory verse utilities if this is a MOV file
    if (src && src.toLowerCase().endsWith('.mov')) {
      console.log("Attempting to generate thumbnail for video:", src);
      
      // Extract the file URL from the src
      const fileUrl = src.includes('/api/object-storage/direct-download') 
        ? new URL(src).searchParams.get('fileUrl')
        : src;
        
      if (fileUrl) {
        try {
          // First try the more general utility for all video types (memory verse or miscellaneous)
          console.log("Using shared video thumbnail handler");
          const success = await handleFailedPosterLoad(fileUrl);
          
          if (success) {
            console.log("Successfully generated video thumbnails");
            // Force reload the video with a slight delay to allow thumbnails to be processed
            setTimeout(() => {
              const video = videoRef.current;
              if (video) {
                // Force the video element to reload with the new poster
                video.load();
                // Set currentTime to 0 to ensure first frame is shown
                video.currentTime = 0;
              }
            }, 500);
            return;
          }
          
          // If that fails, try a manual direct approach with object storage
          console.log("Trying direct thumbnail generation with object storage API");
          const response = await fetch(`/api/object-storage/generate-thumbnail?fileUrl=${encodeURIComponent(fileUrl)}`);
          const data = await response.json();
          
          console.log("Direct thumbnail generation response:", data);
          if (data && data.success) {
            // Try one more time with more aggressive caching parameter to get fresh thumbnail
            const timestamp = Date.now();
            const baseFilename = fileUrl.split('/').pop()?.split('.')[0];
            
            if (baseFilename) {
              // Preload the thumbnail image
              const img = new Image();
              img.onload = () => {
                console.log("Successfully loaded fresh thumbnail");
                // Force reload the video with the new thumbnail
                const video = videoRef.current;
                if (video) {
                  video.load();
                  // Set currentTime to 0 to ensure first frame is shown
                  video.currentTime = 0;
                }
              };
              img.src = `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${baseFilename}.poster.jpg&v=${timestamp}`;
            }
          }
        } catch (error) {
          console.error("Error generating thumbnail:", error);
        }
      }
    }
    
    // If poster fails to load and we couldn't generate one via API,
    // try to generate one from the video locally as a last resort
    if (!generatedPoster && videoRef.current) {
      // Set time to 0 to grab the first frame
      videoRef.current.currentTime = 0;
    }
  };

  // Handle mute/unmute
  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => {
        console.error("Error exiting fullscreen:", err);
      });
    } else {
      videoRef.current.requestFullscreen().catch(err => {
        console.error("Error entering fullscreen:", err);
      });
    }
  };

  // Handle progress bar change
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Update time display
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Generate thumbnail from video
  const generateThumbnail = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the current frame to the canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      try {
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
        setGeneratedPoster(thumbnailUrl);
        console.log("Generated video thumbnail");
      } catch (error) {
        console.error("Error generating thumbnail:", error);
      }
    }
  };

  // Add event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      
      // Set the current time to a very small value to load the first frame
      if (!poster) {
        video.currentTime = 0.1;
      }
    };
    
    const handleSeeked = () => {
      // Generate thumbnail when video has seeked to the specified time
      if (!poster) {
        generateThumbnail();
      }
      setLoading(false);
      if (onLoad) onLoad();
    };
    
    const handleLoadedData = () => {
      if (!poster) {
        // Try to generate thumbnail right away as well
        generateThumbnail();
      }
      setLoading(false);
      if (onLoad) onLoad();
    };
    
    const handleError = (e: Event) => {
      console.error("Video error:", e);
      setLoading(false);
      if (onError) onError(new Error("Failed to load video"));
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [onLoad, onError, poster]);

  return (
    <div 
      className={cn("relative group overflow-hidden rounded-md", className)}
      onMouseMove={showControls}
      onMouseLeave={() => {
        // Hide controls when mouse leaves if video is playing (Facebook behavior)
        if (isPlaying) {
          setControlsVisible(false);
        }
      }}
    >
      {/* Hidden canvas for thumbnail generation */}
      <canvas 
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      {/* Preload poster image */}
      {poster && (
        <img
          src={poster}
          alt="Video thumbnail"
          className="hidden"
          onLoad={handlePosterLoaded}
          onError={handlePosterError}
        />
      )}
      
      <video
        key={key} /* Add key to force re-render when poster changes */
        ref={videoRef}
        src={src}
        poster={poster || generatedPoster || undefined}
        preload={preload}
        playsInline={playsInline}
        className="w-full h-full object-contain"
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
        onClick={() => togglePlay()}
        onLoadedMetadata={() => {
          console.log("Video metadata loaded, poster:", poster || generatedPoster);
          // Immediately set the currentTime to 0 to ensure the first frame is shown
          if (videoRef.current && !isPlaying) {
            videoRef.current.currentTime = 0;
          }
        }}
        onError={(e) => {
          console.error("Video failed to load:", src);
          if (onError) onError(new Error("Failed to load video"));
        }}
      />

      {/* Facebook-style play button overlay when not playing */}
      {!isPlaying && !loading && (
        <div 
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/10"
          onClick={() => togglePlay()}
        >
          <div className="p-6 rounded-full bg-black/40 transform transition-transform hover:scale-110">
            <Play className="h-12 w-12 text-white" fill="white" />
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Facebook-style progress bar - thin line at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 w-full h-1.5 bg-gray-500/30">
        <div 
          className="h-full bg-white relative" 
          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
        >
          {/* Small circle handle at the end of the progress bar */}
          <div className={cn(
            "absolute -right-1.5 -top-1 w-4 h-4 bg-white rounded-full transform scale-0 transition-transform",
            controlsVisible ? "scale-100" : "scale-0"
          )}></div>
        </div>
      </div>

      {/* Facebook-style minimal controls - only shown when hovering */}
      <div className={cn(
        "absolute bottom-2 left-0 right-0 flex items-center justify-between px-4",
        controlsVisible ? "opacity-100 transition-opacity duration-200" : "opacity-0 pointer-events-none transition-opacity duration-200"
      )}>
        {/* Left controls */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }} 
            className="text-white hover:text-gray-300 focus:outline-none"
          >
            {isPlaying ? 
              <Pause size={20} fill="currentColor" /> : 
              <Play size={20} fill="currentColor" />
            }
          </button>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="text-white hover:text-gray-300 focus:outline-none"
          >
            {isMuted ? 
              <VolumeX size={20} /> : 
              <Volume2 size={20} />
            }
          </button>
          
          <span className="text-white text-xs">
            {formatTime(currentTime)} / {formatTime(duration || 0)}
          </span>
        </div>
        
        {/* Right controls */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="text-white hover:text-gray-300 focus:outline-none"
          >
            <Maximize size={20} />
          </button>
          
          <button 
            className="text-white hover:text-gray-300 focus:outline-none"
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}