import React, { useState, useEffect, useRef, forwardRef, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";


interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>; 
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment...",
  defaultValue = "",
  onCancel,
  inputRef
}: CommentFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient(); // Added useQueryClient hook

  const containerRef = useRef<HTMLDivElement>(null);

  // This function handles setting up refs for the textarea
  // Using callback ref to handle all ref assignments
  const setRefs = (element: HTMLTextAreaElement | null) => {
    // Handle forwardRef
    if (typeof ref === 'function') {
      ref(element);
    }
    // No need to assign to internalRef.current as React will do this automatically
  };

  const ensureTextareaFocus = () => {
    // Focus the textarea by ID instead of ref
    const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      console.log("Refocusing textarea");
    }
  };

  useEffect(() => {
    // Focus the textarea after component mounts
    setTimeout(() => {
      const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        console.log("Focus in CommentForm component mount");
      }
    }, 200);
  }, []);

  // Reset textarea height when content is cleared
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
      if (!content.trim()) return;
      await onSubmit(content);

      // Reset state first
      setContent('');

      // Force a re-render to reset the textarea and container
      requestAnimationFrame(() => {
        const textarea = document.getElementById('comment-textarea') as HTMLTextAreaElement;
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
      console.error('Error submitting comment:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim() && !isSubmitting) {
        handleSubmit();
      } else if (!content.trim() && onCancel) {
        onCancel();
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
      <div className="flex items-center">
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
      {onCancel && (
        <div className="flex justify-end mt-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            size="sm"
            className="h-8"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
});

CommentForm.displayName = "CommentForm";