import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  poster,
  className,
  preload = 'metadata',
  playsInline = true,
  onError,
  onLoad,
  disablePictureInPicture = false,
  controlsList = 'nodownload'
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Add event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setLoading(false);
      if (onLoad) onLoad();
    };
    const handleLoadedData = () => {
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
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [onLoad, onError]);

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
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload={preload}
        playsInline={playsInline}
        className="w-full h-full object-contain"
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
        onClick={() => togglePlay()}
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