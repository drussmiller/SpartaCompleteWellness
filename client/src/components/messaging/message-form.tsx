import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Image, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shouldUseChunkedUpload, uploadFileInChunks, type ChunkedUploadResult, type UploadStatus } from "@/lib/chunked-upload";
import { useKeyboardAdjustment } from "@/hooks/use-keyboard-adjustment";

export interface ChunkedUploadInfo {
  mediaUrl: string;
  thumbnailUrl?: string;
  filename: string;
  isVideo: boolean;
}

interface MessageFormProps {
  onSubmit: (content: string, imageData: string | null, isVideo?: boolean, chunkedUploadResult?: ChunkedUploadInfo) => Promise<void>;
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const MessageForm = forwardRef<HTMLTextAreaElement, MessageFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment",
  defaultValue = "",
  onCancel,
  inputRef,
  onFocus: parentOnFocus,
  onBlur: parentOnBlur
}: MessageFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // Added state for selected file
  const [isVideo, setIsVideo] = useState<boolean>(false); // Add state to track if the current file is a video
  const [isChunkedUploading, setIsChunkedUploading] = useState(false);
  const [chunkedUploadProgress, setChunkedUploadProgress] = useState(0);
  const [chunkedUploadStatus, setChunkedUploadStatus] = useState<UploadStatus>('uploading');
  const [chunkedUploadStatusMessage, setChunkedUploadStatusMessage] = useState('');
  const [chunkedUploadResult, setChunkedUploadResult] = useState<ChunkedUploadInfo | null>(null);
  const [pendingLargeVideo, setPendingLargeVideo] = useState<File | null>(null); // Store large video file for deferred upload
  
  // Centralized reset helper for chunked upload state
  const resetChunkedUploadState = () => {
    setChunkedUploadProgress(0);
    setChunkedUploadStatus('uploading');
    setChunkedUploadStatusMessage('');
    setChunkedUploadResult(null);
    setIsChunkedUploading(false);
    setPendingLargeVideo(null);
  };
  
  // Version token to prevent stale chunked upload promises from overwriting current selection
  const uploadVersionRef = useRef<number>(0);
  
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Detect Android device for bottom padding adjustment
  const isAndroid = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('android');

  // Android-specific: Use sessionStorage to persist state across navigation
  const [hasBeenBackgrounded, setHasBeenBackgrounded] = useState(() => {
    if (!isAndroid) return false;
    const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('androidTextboxBackgrounded') : null;
    return stored === 'true';
  });

  // Track keyboard height
  const keyboardHeight = useKeyboardAdjustment();

  // Track backgrounding and wake-up for Android
  useEffect(() => {
    if (!isAndroid) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // App going to background - mark that textbox should have padding
        sessionStorage.setItem('androidTextboxBackgrounded', 'true');
        setHasBeenBackgrounded(true);
      } else if (document.visibilityState === 'visible') {
        // App coming back to foreground - keep the padding flag
        const stored = sessionStorage.getItem('androidTextboxBackgrounded');
        if (stored === 'true') {
          setHasBeenBackgrounded(true);
        }
      }
    };

    const handleOrientationChange = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      if (isPortrait) {
        sessionStorage.setItem('androidTextboxBackgrounded', 'true');
        setHasBeenBackgrounded(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [isAndroid]);

  // This function handles setting up refs for the textarea
  const setRefs = (element: HTMLTextAreaElement | null) => {
    // Handle forwardRef
    if (typeof ref === 'function') {
      ref(element);
    }
  };

  const ensureTextareaFocus = () => {
    // Focus the textarea by ID instead of ref
    const textarea = document.getElementById('message-textarea') as HTMLTextAreaElement;
    if (textarea) {
      // Allow natural focus behavior - don't prevent scroll
      textarea.focus();
    }
  };

  const onFocus = () => {
    parentOnFocus?.();
  };

  const onBlur = () => {
    parentOnBlur?.();
  };

  // Removed auto-focus to prevent keyboard from appearing automatically on mobile

  // Note: Removed scroll prevention as it was causing issues on iOS Safari
  // The position: fixed input should handle positioning correctly

  // Handle paste events for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
              setPastedImage(e.target?.result as string);
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Reset textarea height when content is cleared
  useEffect(() => {
    if (content === '') {
      resetTextarea();
    }
  }, [content]);

  const resetTextarea = () => {
    const textarea = document.getElementById('message-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = '38px';
      const container = textarea.parentElement;
      if (container) {
        container.style.marginTop = '0';
      }
    }
  };

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'; // Reset to auto to get correct scrollHeight
    const newHeight = Math.min(200, textarea.scrollHeight); // Max height of 200px
    textarea.style.height = `${newHeight}px`;
    
    // Enable scrolling if content exceeds max height
    if (textarea.scrollHeight > 200) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
    
    // Adjust container to expand upwards
    const container = textarea.closest('.flex-1') as HTMLElement;
    if (container) {
      container.style.height = `${newHeight}px`;
    }
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim() && !pastedImage) return;

      // Check if chunked upload is still in progress
      if (isChunkedUploading) {
        toast({
          title: "Please wait",
          description: "Video is still uploading...",
          variant: "destructive",
        });
        return;
      }

      // Use a local variable to capture chunked upload result
      let uploadResult = chunkedUploadResult;

      // If there's a pending large video, upload it now before submitting
      if (pendingLargeVideo && !chunkedUploadResult) {
        console.log('Starting chunked upload for pending large video on send:', pendingLargeVideo.name);
        
        uploadVersionRef.current += 1;
        const currentUploadVersion = uploadVersionRef.current;
        
        setIsChunkedUploading(true);
        setChunkedUploadProgress(0);

        try {
          const result = await uploadFileInChunks(pendingLargeVideo, {
            onProgress: (info) => {
              if (uploadVersionRef.current === currentUploadVersion) {
                setChunkedUploadProgress(info.progress);
                setChunkedUploadStatus(info.status);
                setChunkedUploadStatusMessage(info.statusMessage);
              }
            },
            finalizePayload: { postType: 'message' },
          });

          if (uploadVersionRef.current === currentUploadVersion) {
            // Capture result in local variable immediately
            uploadResult = {
              mediaUrl: result.mediaUrl,
              thumbnailUrl: result.thumbnailUrl,
              filename: result.filename,
              isVideo: result.isVideo,
            };
            // Also update state for UI
            setChunkedUploadResult(uploadResult);
            setIsChunkedUploading(false);
            setPendingLargeVideo(null);
          }
        } catch (error) {
          console.error('Chunked upload failed during submit:', error);
          resetChunkedUploadState();
          setPastedImage(null);
          setIsVideo(false);
          toast({
            title: "Upload failed",
            description: "Failed to upload video. Please try again.",
            variant: "destructive",
          });
          return; // Don't proceed with message submission
        }
      }

      // Determine if this is a video file
      const isVideoBySelectedFile = selectedFile?.type.startsWith('video/') || false;
      // Check for video file in the global window object (set earlier when capturing video preview)
      const hasStoredVideoFile = !!(window as any)._SPARTA_ORIGINAL_VIDEO_FILE;
      // Check for chunked upload result (use local variable!)
      const hasChunkedUpload = !!uploadResult;

      // Pass the appropriate isVideo flag
      const finalIsVideo = isVideo || isVideoBySelectedFile || hasStoredVideoFile || hasChunkedUpload;

      // For chunked uploads, we don't need the global video file
      if (finalIsVideo && !hasChunkedUpload && !(window as any)._SPARTA_ORIGINAL_VIDEO_FILE) {
        console.warn("Trying to send a video message but the original video file is missing.");
        console.log("Will attempt to send message without the original video file");
      }

      console.log("Submitting message with isVideo:", finalIsVideo, 
                 "hasStoredVideo:", hasStoredVideoFile,
                 "hasChunkedUpload:", hasChunkedUpload,
                 "chunkedUploadResult:", uploadResult,
                 "originalVideoSize:", (window as any)._SPARTA_ORIGINAL_VIDEO_FILE?.size || 'N/A');

      // Pass chunked upload result if available (use local variable!)
      await onSubmit(content, pastedImage, finalIsVideo, uploadResult || undefined);

      // Reset state
      setContent('');
      setPastedImage(null);
      setSelectedFile(null);
      setIsVideo(false);
      setChunkedUploadResult(null);
      setChunkedUploadProgress(0);

      // Clear the global stored video file reference
      if ((window as any)._SPARTA_ORIGINAL_VIDEO_FILE) {
        console.log("Clearing original video file reference after successful submission");
        (window as any)._SPARTA_ORIGINAL_VIDEO_FILE = null;
      }

      // Force a re-render to reset the textarea and container
      requestAnimationFrame(() => {
        const textarea = document.getElementById('message-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = '38px';
          // Reset both textarea parent and flex-1 container
          const containerElement = textarea.closest('.flex-1');
          if (containerElement instanceof HTMLElement) {
            containerElement.style.height = '50px';
          }
        }
      });
    } catch (error) {
      console.error('Error submitting message:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Enter key to create new lines without submitting
    // Users must click the send button to submit messages
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div 
      className="flex flex-col gap-0 w-full"
      ref={containerRef}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          console.log('File input changed, files:', e.target.files);
          const file = e.target.files?.[0];
          console.log('Selected file:', file?.name, file?.type, file?.size);
          if (file) {
            if (file.size > 100 * 1024 * 1024) { // 100MB limit
              toast({
                title: "Error",
                description: "File is too large. Maximum size is 100MB.",
                variant: "destructive",
              });
              return;
            }

            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            console.log('Created object URL:', url);

            // Handle media files
            if (file.type.startsWith('video/')) {
              // Set the isVideo state to true
              setIsVideo(true);

              // Check if this is a large video that needs chunked upload
              if (shouldUseChunkedUpload(file)) {
                console.log('Large video detected, will upload on send:', file.name, file.size);
                
                // Increment version to invalidate any previous in-flight uploads
                uploadVersionRef.current += 1;
                
                // Clear any previous stored video file and chunked upload results
                if ((window as any)._SPARTA_ORIGINAL_VIDEO_FILE) {
                  console.log('Clearing stored video file for large video');
                  (window as any)._SPARTA_ORIGINAL_VIDEO_FILE = null;
                }
                resetChunkedUploadState();
                
                // Store the file for later upload when user clicks send (AFTER reset)
                setPendingLargeVideo(file);
                
                // Generate thumbnail for preview (don't upload yet)
                const video = document.createElement('video');
                video.src = url;
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;

                video.onloadedmetadata = () => {
                  video.currentTime = 0.1;
                };

                video.onseeked = () => {
                  try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
                      setPastedImage(thumbnailUrl);
                      console.log("Generated video thumbnail for large video preview");
                    }
                  } catch (error) {
                    console.error("Error generating thumbnail:", error);
                  }
                };

                video.load();

                // Show info toast that video will be uploaded on send
                toast({
                  description: `Video selected (${(file.size / (1024 * 1024)).toFixed(1)}MB). Will upload when you send.`,
                  duration: 3000,
                });
              } else {
                // For smaller videos, use the original approach
                // Increment version to invalidate any in-flight chunked uploads
                uploadVersionRef.current += 1;
                // Clear any previous chunked upload result when selecting a new small file
                resetChunkedUploadState();
                
                // Create video element for thumbnail generation
                const video = document.createElement('video');
                video.src = url;
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;

                // Store the original video file in global window object for later use
                // This is needed to preserve the actual video file when sending
                (window as any)._SPARTA_ORIGINAL_VIDEO_FILE = file;
                console.log('Stored original video file in window object:', file.name, file.type, file.size, 'isVideo state set to true');

                // When the video loads, set the current time to the first frame
                video.onloadedmetadata = () => {
                  video.currentTime = 0.1;  // Set to a small value to ensure we get the first frame
                };

                // When the video has seeked to the requested time, capture the frame
                video.onseeked = () => {
                  try {
                    // Create canvas and draw video frame
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                      // Convert to data URL for thumbnail
                      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
                      setPastedImage(thumbnailUrl);
                      console.log("Generated video thumbnail in message form");

                      // Show toast with video details
                      const videoDetails = `Video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`;
                      toast({
                        description: videoDetails,
                        duration: 2000,
                      });
                    }
                  } catch (error) {
                    console.error("Error generating thumbnail:", error);
                  }
                };

                // Start loading the video
                video.load();
              }
            } else {
              // Handle images normally
              setPastedImage(url);

              // Reset isVideo state to false for images
              setIsVideo(false);
              
              // Increment version to invalidate any in-flight chunked uploads
              uploadVersionRef.current += 1;
              // Clear any previous chunked upload result when selecting an image
              setChunkedUploadResult(null);
              setChunkedUploadProgress(0);
              setIsChunkedUploading(false);
              
              // Clear any previous stored video file to prevent stale state
              if ((window as any)._SPARTA_ORIGINAL_VIDEO_FILE) {
                console.log('Clearing stored video file when switching to image');
                (window as any)._SPARTA_ORIGINAL_VIDEO_FILE = null;
              }

              // Show toast with file details
              toast({
                description: `Selected file: ${file.name}`,
                duration: 2000,
              });
            }
          }
        }}
      />
      {pastedImage && (
        <div className="mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <img 
                src={pastedImage} 
                alt="Pasted image" 
                className="max-h-24 max-w-full rounded-lg object-cover"
              />
              {isChunkedUploading && (
                <div className="flex flex-col items-center gap-1">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs font-medium">{Math.round(chunkedUploadProgress)}%</span>
                  {chunkedUploadStatusMessage && chunkedUploadStatusMessage.trim() && (
                    <span className="text-[10px] text-muted-foreground text-center max-w-[100px]">{chunkedUploadStatusMessage}</span>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="destructive"
              size="icon"
              className="h-6 w-6 rounded-full flex-shrink-0"
              onClick={() => {
                setPastedImage(null);
                setIsVideo(false);
                setChunkedUploadResult(null);
                setIsChunkedUploading(false);
                setChunkedUploadProgress(0);
                // Also clear the global stored video file
                if ((window as any)._SPARTA_ORIGINAL_VIDEO_FILE) {
                  console.log("Clearing original video file when removing preview");
                  (window as any)._SPARTA_ORIGINAL_VIDEO_FILE = null;
                }
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            console.log('File picker button clicked, fileInputRef.current:', fileInputRef.current);
            fileInputRef.current?.click();
          }}
          className="flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
            <path d="M16 5V2" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <path d="M9 9h.01" />
            <path d="M15 9h.01" />
          </svg>
        </Button>
        <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <Textarea
            ref={setRefs} 
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              adjustTextareaHeight(e.target);
            }}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            className={`resize-none bg-gray-100 rounded-md py-2 px-4 border border-gray-300`}
            rows={1}
            style={{ 
              height: 'auto', 
              minHeight: '38px', 
              maxHeight: '200px',
              paddingBottom: (isAndroid && hasBeenBackgrounded) ? '12px' : '8px'
            }}
            id="message-textarea"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={isSubmitting || (!content.trim() && !pastedImage)}
          className="ml-2"
        >
          {isSubmitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-primary">
              <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
            </svg>
          )}
        </Button>
      </div>
    </div>
  );
});

MessageForm.displayName = "MessageForm";