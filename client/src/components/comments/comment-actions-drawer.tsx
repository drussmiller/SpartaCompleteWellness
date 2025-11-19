import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface CommentActionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onReply: (commentId: number) => void;
  onEdit: (commentId: number) => void;
  onDelete: () => void;
  onCopy: () => void;
  canEdit: boolean;
  canDelete: boolean;
  commentId: number | null;
}

export function CommentActionsDrawer({
  isOpen,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  canEdit,
  canDelete,
  commentId
}: CommentActionsDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-fit max-h-[40vh] p-0 z-[9999]"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)'
        }}
      >
        <div className="flex flex-col w-full">
          <Button
            variant="ghost"
            className="w-full h-14 text-blue-500 hover:text-blue-600 hover:bg-gray-100 rounded-none border-b text-xl"
            onClick={() => {
              if (commentId) onReply(commentId);
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
                if (commentId) onEdit(commentId);
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
        </div>
      </SheetContent>
    </Sheet>
  );
}