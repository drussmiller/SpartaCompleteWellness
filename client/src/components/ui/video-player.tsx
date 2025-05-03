import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleFailedPosterLoad, getMemoryVersePoster } from '@/lib/memory-verse-utils';

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
  // Try to get memory verse poster if it's a MOV file
  const memoryVersePoster = src?.toLowerCase().endsWith('.mov') 
    ? getMemoryVersePoster(src) 
    : undefined;
  
  // Use memory verse poster as default if available, otherwise use provided poster
  const poster = memoryVersePoster || initialPoster;
  
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
  
  // Log if we're using a memory verse poster
  useEffect(() => {
    if (memoryVersePoster) {
      console.log("Using memory verse poster:", memoryVersePoster);
    }
  }, [memoryVersePoster]);

  // Show controls when mouse moves over the video
  const showControls = () => {
    setControlsVisible(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, 3000);
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
      console.log("Attempting to generate thumbnail for memory verse video:", src);
      
      // Extract the file URL from the src
      const fileUrl = src.includes('/api/object-storage/direct-download') 
        ? new URL(src).searchParams.get('fileUrl')
        : src;
        
      if (fileUrl) {
        try {
          // First try the memory verse thumbnail handler for authenticated API
          console.log("Using memory verse thumbnail handler");
          const success = await handleFailedPosterLoad(fileUrl);
          
          if (success) {
            console.log("Successfully generated memory verse thumbnails");
            // Force reload the video with a slight delay to allow thumbnails to be processed
            setTimeout(() => {
              const video = videoRef.current;
              if (video) {
                // Force the video element to reload with the new poster
                video.load();
              }
            }, 500);
            return;
          }
          
          // If that fails, fall back to the object storage direct API
          console.log("Falling back to object storage thumbnail generator");
          const response = await fetch(`/api/object-storage/generate-thumbnail?fileUrl=${encodeURIComponent(fileUrl)}`);
          const data = await response.json();
          
          console.log("Thumbnail generation response:", data);
          if (data.success) {
            // Force reload the video with the new thumbnail
            const video = videoRef.current;
            if (video) {
              // Force the video element to reload with the new poster
              video.load();
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
      // Set a small time to grab the first frame
      videoRef.current.currentTime = 0.1;
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
        }}
        onError={(e) => {
          console.error("Video failed to load:", src);
          if (onError) onError(new Error("Failed to load video"));
        }}
      />

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Custom controls overlay */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-black/60 text-white transition-opacity p-2",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar */}
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleProgressChange}
          className="w-full h-1 bg-gray-400 rounded-full appearance-none cursor-pointer"
          style={{
            backgroundSize: `${(currentTime / (duration || 1)) * 100}% 100%`,
            backgroundImage: 'linear-gradient(#8A2BE2, #8A2BE2)'
          }}
        />
        
        {/* Controls buttons */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }} 
              className="p-1 hover:bg-white/20 rounded-full"
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className="p-1 hover:bg-white/20 rounded-full"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            
            <span className="text-xs">
              {formatTime(currentTime)} / {formatTime(duration || 0)}
            </span>
          </div>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="p-1 hover:bg-white/20 rounded-full"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}