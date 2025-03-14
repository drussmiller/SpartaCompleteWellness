import { useState, useEffect, useRef } from "react";
import { forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query"; // Added import


interface CommentFormProps {
  onSubmit: (content: string, postId: string) => Promise<void>; // Added postId
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
  postId: string; // Added postId
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({ 
  onSubmit, 
  isSubmitting, 
  placeholder = "Enter a comment...",
  defaultValue = "",
  onCancel,
  inputRef,
  postId // Added postId
}: CommentFormProps, ref) => {
  const [content, setContent] = useState(defaultValue);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient(); // Added useQueryClient hook

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

  const ensureTextareaFocus = () => {
    if (internalRef.current) {
      internalRef.current.focus();
      console.log("Refocusing textarea");
    }
  };

  useEffect(() => {
    if (internalRef.current) {
      setTimeout(() => {
        internalRef.current?.focus();
        console.log("Focus in CommentForm component mount");
      }, 200);
    }
  }, []);

  // Reset textarea height when content is cleared
  useEffect(() => {
    if (content === '') {
      resetTextarea();
    }
  }, [content]);

  const resetTextarea = () => {
    if (internalRef.current) {
      internalRef.current.style.height = '38px';
      const container = internalRef.current.parentElement;
      if (container) {
        container.style.marginTop = '0';
      }
    }
  };

  const handleSubmit = async () => {
    try {
      if (!content.trim()) return;
      await onSubmit(content, postId);

      // Reset state first
      setContent('');

      // Force a re-render to reset the textarea and container
      requestAnimationFrame(() => {
        if (internalRef.current) {
          internalRef.current.style.height = '38px';
          // Reset both textarea parent and flex-1 container
          const container = internalRef.current.closest('.flex-1');
          if (container) {
            container.style.height = '50px';
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
      className="flex flex-col gap-1 pb-14 fixed bottom-0 left-0 right-0 bg-background z-50" 
      ref={containerRef}
      style={{ minHeight: 'fit-content' }}
      onClick={(e) => {
        ensureTextareaFocus();
        e.stopPropagation();
      }}
    >
      <div className="flex items-end gap-0"> {/* Changed gap from 2 to 1 */}
        <div className="flex-1 relative">
          <div className="absolute bottom-0 w-full pl-8 pr-4">
            <Textarea
              ref={setRefs} 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              ref={(element) => {
                setRefs(element);
                if (element && defaultValue) {
                  // Adjust height for existing content
                  element.style.height = 'auto';
                  element.style.height = `${element.scrollHeight}px`;
                  const container = element.closest('.flex-1');
                  if (container) {
                    container.style.height = `${element.scrollHeight + 12}px`;
                  }
                }
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;

                // Adjust container height
                const container = target.closest('.flex-1');
                if (container) {
                  container.style.height = `${target.scrollHeight + 12}px`;
                }

                // Update parent container height
                if (containerRef.current) {
                  containerRef.current.style.height = 'auto';
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={placeholder}
              className="resize-none bg-gray-100 overflow-hidden"
              rows={1}
              style={{ height: '29px', minHeight: '29px' }}
              id="comment-textarea"
            />
          </div>
        </div>
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="self-end b-2 pr-4"
        >
          {/* Assuming Send is a component or icon */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-primary">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </Button>
      </div>
      {onCancel && (
        <div className="flex justify-end gap-2">
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