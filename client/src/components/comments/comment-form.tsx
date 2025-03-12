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

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content, postId); // Pass postId to onSubmit
    setContent("");
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
      className="flex flex-col gap-2" 
      ref={containerRef}
      onClick={(e) => {
        ensureTextareaFocus();
        e.stopPropagation();
      }}
    >
      <div className="flex gap-2">
        <Textarea
          ref={setRefs} 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="resize-none bg-gray-100"
          rows={1}
          id="comment-textarea"
          style={{ height: '38px', minHeight: '38px', maxHeight: '38px' }}
          disabled={isSubmitting}
          autoFocus={true} 
          onFocus={() => console.log("Textarea focused")}
          onClick={() => console.log("Textarea clicked")}
        />
        {isSubmitting && (
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
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