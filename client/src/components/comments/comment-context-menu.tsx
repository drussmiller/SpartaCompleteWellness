
import { useState, useRef, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface CommentContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  canEdit: boolean;
}

export function CommentContextMenu({
  isOpen,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  canEdit
}: CommentContextMenuProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="p-0 max-h-64">
        <div className="bg-background rounded-t-lg overflow-hidden flex flex-col">
          <button 
            onClick={onReply}
            className="py-4 px-6 text-center text-blue-500 font-medium border-b"
          >
            Reply
          </button>
          
          {canEdit && onEdit && (
            <button 
              onClick={onEdit}
              className="py-4 px-6 text-center text-blue-500 font-medium border-b"
            >
              Edit
            </button>
          )}
          
          {canEdit && onDelete && (
            <button 
              onClick={onDelete}
              className="py-4 px-6 text-center text-red-500 font-medium border-b"
            >
              Delete
            </button>
          )}
          
          {onCopy && (
            <button 
              onClick={onCopy}
              className="py-4 px-6 text-center text-blue-500 font-medium border-b"
            >
              Copy
            </button>
          )}
          
          <button 
            onClick={onClose}
            className="py-4 px-6 text-center text-blue-500 font-medium mt-2 mb-6"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
