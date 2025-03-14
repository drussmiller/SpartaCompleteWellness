import { useState, useEffect, useRef } from "react";
import { forwardRef } from "react";
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
  postId: string;
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment...",
  defaultValue = "",
  onCancel,
  inputRef,
  postId
}: CommentFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const setRefs = (element: HTMLTextAreaElement | null) => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(element);
      } else {
        ref.current = element;
      }
    }
    if (inputRef) {
      inputRef.current = element;
    }
    internalRef.current = element;
  };

  const resetTextarea = () => {
    if (internalRef.current) {
      internalRef.current.style.height = '38px';
      const container = internalRef.current.parentElement;
      if (container instanceof HTMLElement) {
        container.style.marginTop = '0';
      }
    }
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim()) return;
      await onSubmit(content);
      setContent('');
      requestAnimationFrame(() => {
        if (internalRef.current) {
          internalRef.current.style.height = '38px';
          const container = internalRef.current.closest('.flex-1');
          if (container instanceof HTMLElement) {
            container.style.height = '50px';
          }
        }
      });
    } catch (error) {
      console.error('Error submitting comment:', error);
    }
  };

  return (
    <div 
      className="flex flex-col gap-1 fixed bottom-0 left-0 right-0 bg-background z-50 border-t border-border" 
      ref={containerRef}
      style={{ minHeight: 'fit-content' }}
    >
      <div className="flex items-end gap-0 px-4 py-2">
        <div className="flex-1 relative">
          <Textarea
            ref={setRefs}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
              const container = target.closest('.flex-1');
              if (container instanceof HTMLElement) {
                container.style.height = `${target.scrollHeight + 12}px`;
              }
              if (containerRef.current) {
                containerRef.current.style.height = 'auto';
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            className="resize-none bg-gray-100 overflow-hidden"
            rows={1}
            style={{ height: '29px', minHeight: '29px' }}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="self-end pr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-primary">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </Button>
      </div>
      {onCancel && (
        <div className="flex justify-end gap-2 px-4 pb-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            size="sm"
            className="h-8"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
            size="sm"
            className="h-8"
          >
            Update
          </Button>
        </div>
      )}
    </div>
  );
});

CommentForm.displayName = "CommentForm";