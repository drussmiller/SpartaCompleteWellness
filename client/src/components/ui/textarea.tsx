import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    
    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        const newHeight = Math.min(textarea.scrollHeight, 200); // ~10 lines at 20px per line
        textarea.style.height = `${newHeight}px`;
        
        // Enable scrolling if content exceeds max height
        if (textarea.scrollHeight > 200) {
          textarea.style.overflowY = 'auto';
        } else {
          textarea.style.overflowY = 'hidden';
        }
      }
    };

    React.useEffect(() => {
      adjustHeight();
    }, [props.value]);

    return (
      <textarea
        className={cn(
          "flex min-h-[38px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        )}
        style={{ maxHeight: '200px' }}
        ref={(element) => {
          if (ref) {
            if (typeof ref === 'function') ref(element);
            else ref.current = element;
          }
          textareaRef.current = element;
        }}
        onInput={adjustHeight}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
