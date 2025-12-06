import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { useRef, useEffect, useState } from "react";

interface CommentActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

export function CommentActionsDrawer({
  isOpen,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  canEdit,
  canDelete
}: CommentActionsDrawerProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isClickListenerReady, setIsClickListenerReady] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsClickListenerReady(false);
      return;
    }
    
    // Delay click listener attachment to avoid catching the opening click
    const timer = setTimeout(() => {
      setIsClickListenerReady(true);
    }, 50);
    
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isClickListenerReady) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen, isClickListenerReady, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex flex-col w-full"
      style={{
        zIndex: 999999999,
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        maxHeight: '40vh',
        overflow: 'auto'
      }}
    >
      <Button
        variant="ghost"
        className="w-full h-14 text-blue-500 hover:text-blue-600 hover:bg-gray-100 rounded-none border-b text-xl"
        onClick={() => {
          onReply();
          onClose();
        }}
      >
        Reply
      </Button>

      {canEdit && (
        <Button
          variant="ghost"
          className="w-full h-14 text-blue-500 hover:text-blue-600 hover:bg-gray-100 rounded-none border-b text-xl"
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          Edit
        </Button>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          className="w-full h-14 text-destructive hover:text-destructive hover:bg-gray-100 rounded-none border-b text-xl"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete
        </Button>
      )}

      <Button
        variant="ghost"
        className="w-full h-14 text-blue-500 hover:text-blue-600 hover:bg-gray-100 rounded-none border-b text-xl"
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        Copy
      </Button>

      <Button
        variant="ghost"
        className="w-full h-14 text-muted-foreground hover:bg-gray-100 rounded-none text-xl"
        onClick={onClose}
      >
        Cancel
      </Button>
    </div>,
    document.body
  );
}