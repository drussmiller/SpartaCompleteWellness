import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Image, X } from "lucide-react";

interface MessageFormProps {
  onSubmit: (content: string, imageData: string | null) => Promise<void>;
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const MessageForm = forwardRef<HTMLTextAreaElement, MessageFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a message",
  defaultValue = "",
  onCancel,
  inputRef
}, ref) => {
  const [content, setContent] = useState(defaultValue);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const setRefs = (element: HTMLTextAreaElement | null) => {
    if (typeof ref === 'function') {
      ref(element);
    }
  };

  const handleSubmit = async () => {
    if ((content.trim() || pastedImage) && !isSubmitting) {
      try {
        await onSubmit(content, pastedImage);
        setContent('');
        setPastedImage(null);
      } catch (error) {
        console.error('Error submitting message:', error);
      }
    }
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((content.trim() || pastedImage) && !isSubmitting) {
        await onSubmit(content, pastedImage);
        setContent('');
        setPastedImage(null);
      }
    }
  };

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

  return (
    <div 
      className="flex flex-col gap-2 w-full"
      ref={containerRef}
    >
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
        <div className="flex-1">
          <Textarea
            ref={setRefs} 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="resize-none bg-gray-100 overflow-hidden rounded-full py-2 px-4"
            rows={1}
            style={{ height: '38px', minHeight: '38px' }}
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