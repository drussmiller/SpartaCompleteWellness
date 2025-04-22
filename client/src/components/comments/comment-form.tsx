import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";


interface CommentFormProps {
  onSubmit: (content: string, file?: File) => Promise<void>; 
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment",
  defaultValue = "",
  onCancel,
  inputRef
}: CommentFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null); // Added state for video thumbnail
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient(); 
  const { toast } = useToast();

  const containerRef = useRef<HTMLDivElement>(null);

  const setRefs = (element: HTMLTextAreaElement | null) => {
    if (typeof ref === 'function') {
      ref(element);
    }
  };

  const ensureTextareaFocus = () => {
    const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      console.log("Refocusing textarea");
    }
  };

  useEffect(() => {
    setTimeout(() => {
      const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        console.log("Focus in CommentForm component mount");
      }
    }, 200);
  }, []);

  useEffect(() => {
    if (content === '') {
      resetTextarea();
    }
  }, [content]);

  const resetTextarea = () => {
    const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = '38px';
      const container = textarea.parentElement;
      if (container) {
        container.style.marginTop = '0';
      }
    }
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim() && !selectedFile) return;

      const formData = new FormData();
      formData.append('content', content);
      if (selectedFile) {
        formData.append('image', selectedFile);  // Using 'image' to match server's multer config
      }

      await onSubmit(content, selectedFile || undefined);

      setContent('');
      setSelectedFile(null);
      setVideoThumbnail(null); // Clear thumbnail after submit
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      requestAnimationFrame(() => {
        const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
        if (textarea) {
          textarea.style.height = '38px';
          const containerElement = textarea.closest('.flex-1');
          if (containerElement instanceof HTMLElement) {
            containerElement.style.height = '50px';
          }
        }
      });
    } catch (error) {
      console.error('Error submitting comment:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() && !isSubmitting) {
        handleSubmit();
      }
    }
  };

  return (
    <div 
      className="flex flex-col gap-1 w-full"
      ref={containerRef}
      onClick={(e) => {
        ensureTextareaFocus();
        e.stopPropagation();
      }}
    >
      {selectedFile && (
        <div className="mb-2">
          <div className="relative inline-flex items-start gap-2">
            {selectedFile.type.startsWith('image/') ? (
              <img 
                src={URL.createObjectURL(selectedFile)} 
                alt="Selected image" 
                className="max-h-24 max-w-full rounded-lg object-cover"
              />
            ) : selectedFile.type.startsWith('video/') ? (
              <img 
                src={videoThumbnail || ''} // Display thumbnail if available
                alt="Video Thumbnail" 
                className="max-h-24 max-w-full rounded-lg object-cover"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {selectedFile.name}
              </span>
            )}
            <Button
              variant="destructive"
              size="icon"
              className="h-6 w-6 rounded-full flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setVideoThumbnail(null); // Clear thumbnail when removing file
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
          onChange={(e) => {
            const file = e.target.files?.[0];
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

              // Handle video files
              if (file.type.startsWith('video/')) {
                const url = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.src = url;
                video.onloadeddata = () => {
                  video.currentTime = 0;
                  video.onseeked = () => {
                    // Create canvas and draw video frame
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(video, 0, 0);

                    // Convert to data URL for thumbnail
                    const thumbnailUrl = canvas.toDataURL('image/jpeg');
                    const videoDetails = `Video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`;
                    setVideoThumbnail(thumbnailUrl);
                    toast({
                      description: videoDetails,
                      duration: 2000,
                    });
                  };
                };
              } else {
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
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = '38px';
              const newHeight = Math.min(200, target.scrollHeight); 
              target.style.height = `${newHeight}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="resize-none bg-gray-100 overflow-hidden rounded-full py-2 px-4"
            rows={1}
            style={{ height: '38px', minHeight: '38px' }}
            id="comment-textarea"
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
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

CommentForm.displayName = "CommentForm";