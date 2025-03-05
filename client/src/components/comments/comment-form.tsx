import { useState, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting: boolean;
  placeholder?: string;
}

export function CommentForm({ onSubmit, isSubmitting, placeholder = "Write a comment... (Press Enter to submit)" }: CommentFormProps) {
  const [content, setContent] = useState("");

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
    <div className="flex">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="resize-none bg-gray-100"
        rows={1}
        style={{ height: '38px', minHeight: '38px', maxHeight: '38px', resize: 'none' }}
        disabled={isSubmitting}
      />
      {isSubmitting && (
        <div className="flex items-center justify-center ml-2">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}