
import { useState, KeyboardEvent, RefObject, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting: boolean;
  placeholder?: string;
  defaultValue?: string;
  onCancel?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
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

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content);
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
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Textarea
          ref={ref || inputRef} // Use either the forwarded ref or inputRef
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="resize-none bg-gray-100"
          rows={1}
          style={{ height: '38px', minHeight: '38px', maxHeight: '38px' }}
          disabled={isSubmitting}
          autoFocus={true} // Add autoFocus attribute
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
