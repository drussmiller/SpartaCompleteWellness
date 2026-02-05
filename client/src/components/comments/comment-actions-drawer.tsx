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
  const openTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setIsClickListenerReady(false);
      return;
    }
    
    openTimeRef.current = Date.now();
    const timer = setTimeout(() => {
      setIsClickListenerReady(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isClickListenerReady) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close within 200ms of opening
      if (Date.now() - openTimeRef.current < 200) {
        return;
      }
      
      // Ignore right-clicks
      if (e.button === 2) return;
      
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isClickListenerReady, onClose]);

  if (!isOpen) return null;

  // Portal directly to body to ensure full-screen coverage for backdrop and drawer
  const target = typeof document !== 'undefined' ? document.body : null;

  if (!target) return null;
  
  return createPortal(
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/30"
        style={{ zIndex: 2147483646, pointerEvents: 'auto' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        ref={menuRef}
        className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 flex flex-col w-full shadow-2xl"
        style={{
          zIndex: 2147483647,
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
          maxHeight: '40vh',
          overflow: 'auto',
          pointerEvents: 'auto'
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
      </div>
    </>,
    target
  );
}