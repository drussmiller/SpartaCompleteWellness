import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useVideoUpload, VideoUploadResult } from "@/hooks/use-video-upload";
import { useKeyboardAdjustment } from "@/hooks/use-keyboard-adjustment";

interface CommentFormProps {
  onSubmit: (content: string, file?: File, chunkedUploadData?: VideoUploadResult) => Promise<void>; 
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  disableAutoScroll?: boolean;
  skipScrollReset?: boolean;
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment",
  defaultValue = "",
  onCancel,
  inputRef,
  disableAutoScroll = false,
  skipScrollReset = false
}: CommentFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient(); 
  const { toast } = useToast();
  
  // Use the video upload hook for handling video files
  const videoUpload = useVideoUpload({
    maxSizeMB: 100,
    autoGenerateThumbnail: true,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Detect Android device for bottom padding adjustment
  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  // Track keyboard height
  const keyboardHeight = useKeyboardAdjustment();

  const textareaRef = inputRef || internalRef;

  const setRefs = (element: HTMLTextAreaElement | null) => {
    (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
    if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = element;
    }
    if (typeof ref === 'function') {
      ref(element);
    }
  };

  useEffect(() => {
    // Adjust height if there's default content
    if (textareaRef.current && defaultValue) {
      const textarea = textareaRef.current;
      textarea.style.height = '38px';
      const newHeight = Math.min(200, textarea.scrollHeight);
      textarea.style.height = `${newHeight}px`;
      if (textarea.scrollHeight > 200) {
        textarea.style.overflowY = 'auto';
      } else {
        textarea.style.overflowY = 'hidden';
      }
    }
  }, [defaultValue]);

  useEffect(() => {
    if (content === '') {
      resetTextarea();
    }
  }, [content]);

  const resetTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
      const container = textareaRef.current.parentElement;
      if (container) {
        container.style.marginTop = '0';
      }
    }
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim() && !selectedFile && !videoUpload.state.file) return;

      // Use video file from hook if available, otherwise use selectedFile
      const fileToSubmit = videoUpload.state.file || selectedFile || undefined;
      
      let chunkedUploadResult: VideoUploadResult | undefined = undefined;
      
      // For video files, use the hook's uploadVideo method which handles chunked upload
      if (videoUpload.state.file) {
        console.log('Uploading video via useVideoUpload hook for comment');
        const result = await videoUpload.uploadVideo('comment');
        if (result) {
          chunkedUploadResult = result;
          console.log('Video upload completed via hook:', result);
        }
        // If result is null, it means the file was too small for chunked upload
        // and will be uploaded directly via FormData
      }
      
      // Pass chunked upload data if available, otherwise pass the file for small videos/images
      await onSubmit(
        content, 
        chunkedUploadResult ? undefined : fileToSubmit, 
        chunkedUploadResult
      );

      setContent('');
      setSelectedFile(null);
      videoUpload.clear(); // Clear video upload state
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = '38px';
          const containerElement = textareaRef.current.closest('.flex-1');
          if (containerElement instanceof HTMLElement) {
            containerElement.style.height = '50px';
          }
        }
      });
    } catch (error) {
      console.error('Error submitting comment:', error);
      // Clear upload state to allow retry
      videoUpload.clear();
      setSelectedFile(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Enter key to create new lines without submitting
    // Users must click the send button to submit comments
  };

  return (
    <div 
      className="flex flex-col gap-1 w-full"
      ref={containerRef}
    >
      {(selectedFile || videoUpload.state.file) && (
        <div className="mb-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {selectedFile?.type.startsWith('image/') ? (
                <img 
                  src={URL.createObjectURL(selectedFile)} 
                  alt="Selected image" 
                  className="max-h-24 max-w-full rounded-lg object-cover"
                />
              ) : (videoUpload.state.file || selectedFile?.type.startsWith('video/')) ? (
                <img 
                  src={videoUpload.state.thumbnail || ''} 
                  alt="Video Thumbnail" 
                  className="max-h-24 max-w-full rounded-lg object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {selectedFile?.name}
                </span>
              )}
              {videoUpload.state.isUploading && (
                <div className="flex flex-col items-center gap-1">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs font-medium">{Math.round(videoUpload.state.uploadProgress)}%</span>
                  {videoUpload.state.uploadStatusMessage && videoUpload.state.uploadStatusMessage.trim() && (
                    <span className="text-[10px] text-muted-foreground text-center max-w-[100px]">{videoUpload.state.uploadStatusMessage}</span>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="destructive"
              size="icon"
              className="h-6 w-6 rounded-full flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                videoUpload.clear();
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex gap-2 items-center">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              // Handle video files with the useVideoUpload hook
              if (file.type.startsWith('video/')) {
                await videoUpload.selectFile(file);
              } else {
                // Handle image files normally
                if (file.size > 100 * 1024 * 1024) { // 100MB limit
                  toast({
                    title: "Error",
                    description: "File is too large. Maximum size is 100MB.",
                    variant: "destructive",
                  });
                  return;
                }
                
                setSelectedFile(file);
                toast({
                  description: `Selected file: ${file.name}`,
                  duration: 2000,
                });
              }
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
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
        <div className="flex-1">
          <Textarea
            ref={setRefs} 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onClick={(e) => {
              console.log("Textarea clicked");
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              console.log("Textarea touchstart");
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              console.log("Textarea touchend");
              e.stopPropagation();
            }}
            onFocus={() => console.log("Textarea focused")}
            onBlur={() => console.log("Textarea blurred")}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = '38px';
              const newHeight = Math.min(200, target.scrollHeight); 
              target.style.height = `${newHeight}px`;
              
              // Enable scrolling if content exceeds max height
              if (target.scrollHeight > 200) {
                target.style.overflowY = 'auto';
              } else {
                target.style.overflowY = 'hidden';
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            readOnly={false}
            disabled={false}
            tabIndex={0}
            className={`resize-none bg-gray-100 rounded-md py-2 px-4 border-2 border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-300 focus:outline-none transition-all ${isAndroid && keyboardHeight === 0 ? 'pb-[12px]' : ''}`}
            rows={1}
            style={{ 
              height: '38px', 
              minHeight: '38px', 
              maxHeight: '200px', 
              overflowY: 'auto',
              pointerEvents: 'auto',
              WebkitUserSelect: 'text',
              userSelect: 'text',
              WebkitTapHighlightColor: 'transparent'
            }}
            data-testid="comment-textarea"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck={true}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={isSubmitting || videoUpload.state.isUploading || (!content.trim() && !selectedFile && !videoUpload.state.file)}
          className="ml-2"
        >
          {isSubmitting || videoUpload.state.isUploading ? (
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

CommentForm.displayName = "CommentForm";