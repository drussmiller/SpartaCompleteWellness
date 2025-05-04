import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getVideoPoster } from '@/lib/memory-verse-utils';

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
  disablePictureInPicture = true,
  controlsList = 'nodownload'
}: VideoPlayerProps) {
  // Try to get video poster if it's a MOV file
  const videoPoster = src?.toLowerCase().endsWith('.mov') ? getVideoPoster(src) : undefined;
  const poster = videoPoster || initialPoster;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format time to display
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Handle video playback
  const togglePlay = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!videoRef.current) return;
    
    try {
      if (videoRef.current.paused) {
        console.log("Playing video");
        const playPromise = videoRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("Video started successfully");
              setIsPlaying(true);
              
              // Auto-hide controls after delay when playing
              if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
              }
              
              controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
              }, 3000);
            })
            .catch(error => {
              console.error("Play error:", error);
              setIsPlaying(false);
              if (onError) onError(new Error(`Failed to play: ${error.message}`));
            });
        }
      } else {
        console.log("Pausing video");
        videoRef.current.pause();
        setIsPlaying(false);
        
        // Always show controls when paused
        setShowControls(true);
        
        // Clear any auto-hide timeout
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
      }
    } catch (error) {
      console.error("Toggle play error:", error);
      if (onError) onError(new Error(`Play/pause error: ${error}`));
    }
  };

  // Toggle mute state
  const toggleMute = () => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Update progress bar
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    
    const newTime = parseFloat(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };
  
  // Show/hide controls on mobile touch
  const handleVideoTap = () => {
    // Toggle controls visibility when video is tapped
    setShowControls(!showControls);
    
    // If playing, set a timeout to hide controls
    if (isPlaying) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };
  
  // Clean up timeouts
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);
  
  // Set up video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const handleDurationChange = () => {
      setDuration(video.duration);
    };
    
    const handleLoadedData = () => {
      console.log("Video data loaded");
      setLoading(false);
      setDuration(video.duration);
      if (onLoad) onLoad();
    };
    
    const handleError = () => {
      console.error("Video load error");
      if (onError) onError(new Error("Video failed to load"));
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [onLoad, onError]);

  return (
    <div 
      className={cn("relative rounded-md overflow-hidden", className)}
      onClick={handleVideoTap}
    >
      {/* Hidden video element without controls */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload={preload}
        playsInline={playsInline}
        className="w-full h-full object-contain"
        controls={false}
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Play/pause overlay button */}
      {!isPlaying && (
        <div 
          className="absolute inset-0 flex items-center justify-center"
          onClick={(e) => { 
            e.stopPropagation();
            togglePlay();
          }}
        >
          <div className="p-4 rounded-full bg-black/40 touch-manipulation">
            <Play size={40} className="text-white" fill="white" />
          </div>
        </div>
      )}
      
      {/* Mobile-friendly custom controls */}
      {showControls && (
        <div 
          className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 touch-manipulation"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer touch-manipulation"
            style={{
              background: `linear-gradient(to right, white ${(currentTime / (duration || 1)) * 100}%, gray ${(currentTime / (duration || 1)) * 100}%)`,
            }}
          />
          
          {/* Controls row */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center space-x-2">
              {/* Play/pause button */}
              <button 
                onClick={() => togglePlay()}
                className="p-1 text-white focus:outline-none touch-manipulation"
              >
                {isPlaying ? 
                  <Pause className="w-6 h-6" /> : 
                  <Play className="w-6 h-6" />
                }
              </button>
              
              {/* Mute/unmute button */}
              <button
                onClick={toggleMute}
                className="p-1 text-white focus:outline-none touch-manipulation"
              >
                {isMuted ? 
                  <VolumeX className="w-6 h-6" /> : 
                  <Volume2 className="w-6 h-6" />
                }
              </button>
            </div>
            
            {/* Time display */}
            <div className="text-white text-xs">
              {formatTime(currentTime)} / {formatTime(duration || 0)}
            </div>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
}