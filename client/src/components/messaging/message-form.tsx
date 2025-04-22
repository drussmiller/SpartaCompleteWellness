import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Image, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageFormProps {
  onSubmit: (content: string, imageData: string | null, isVideo?: boolean) => Promise<void>;
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const MessageForm = forwardRef<HTMLTextAreaElement, MessageFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment",
  defaultValue = "",
  onCancel,
  inputRef
}: MessageFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null); // Added state for selected file
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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
      textarea.focus();
    }
  };

  useEffect(() => {
    // Focus the textarea after component mounts
    setTimeout(() => {
      const textarea = document.getElementById('message-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
      }
    }, 200);
  }, []);

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

  const handleSubmit = async () => {
    try {
      if (!content.trim() && !pastedImage) return;
      
      // Pass the isVideo flag if it's a video file
      const isVideo = selectedFile?.type.startsWith('video/') || false;
      await onSubmit(content, pastedImage, isVideo);

      // Reset state
      setContent('');
      setPastedImage(null);
      setSelectedFile(null); // Reset selected file

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
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() || pastedImage) {
        // Call handleSubmit directly without await to avoid the double-Enter issue
        // This is because the async nature of the function was causing a delay
        handleSubmit();
      }
      // Do not cancel if content is empty
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div 
      className="flex flex-col gap-2 w-full"
      ref={containerRef}
      onClick={(e) => {
        ensureTextareaFocus();
        e.stopPropagation();
      }}
    >
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
            const url = URL.createObjectURL(file);

            // Handle video files
            if (file.type.startsWith('video/')) {
              // Create video element for thumbnail generation
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
                  setPastedImage(thumbnailUrl);
                };
              };
            } else {
              // Handle images normally
              if (file.type.startsWith('video/')) {
                if (file.size > 100 * 1024 * 1024) { // 100MB limit
                  toast({
                    title: "Error",
                    description: "Video file is too large. Maximum size is 100MB.",
                    variant: "destructive",
                  });
                  return;
                }
              }
              setPastedImage(url);
            }
          }
        }}
      />
      {pastedImage && (
        <div className="relative inline-block max-w-xs mb-2">
          <img 
            src={pastedImage} 
            alt="Pasted image" 
            className="max-h-24 max-w-full rounded-lg object-cover"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={() => setPastedImage(null)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="flex items-center">
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
              const newHeight = Math.min(200, target.scrollHeight); // Max height of 200px
              target.style.height = `${newHeight}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="resize-none bg-gray-100 overflow-hidden rounded-full py-2 px-4"
            rows={1}
            style={{ height: '38px', minHeight: '38px' }}
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