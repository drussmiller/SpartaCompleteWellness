import React, { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerFooter 
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface PostOptionsMenuProps {
  postId: number;
  onDelete: (postId: number) => void;
  onEdit: (postId: number) => void;
}

export function PostOptionsMenu({ postId, onDelete, onEdit }: PostOptionsMenuProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Post deleted",
          description: "Your post has been deleted successfully.",
        });

        // Invalidate queries to refetch data
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        onDelete(postId);
      } else {
        toast({
          title: "Error",
          description: "Failed to delete post. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
    setOpen(false);
  };

  const handleEdit = () => {
    onEdit(postId);
    setOpen(false);
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="absolute right-3 top-3 h-7 w-7 hover:bg-gray-100"
        onClick={() => setOpen(true)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Post Options</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col p-0">
            <button
              className="w-full p-4 text-blue-600 font-semibold flex justify-center border-b hover:bg-muted text-lg"
              onClick={handleEdit}
            >
              Edit Post
            </button>
            <button
              className="w-full p-4 text-red-600 font-semibold flex justify-center hover:bg-muted text-lg"
              onClick={handleDelete}
            >
              Delete Post
            </button>
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}