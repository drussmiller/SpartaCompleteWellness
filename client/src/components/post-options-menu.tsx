
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PostOptionsMenu({ 
  postId, 
  userId, 
  currentUserId,
  isAdmin = false
}: { 
  postId: number; 
  userId: number;
  currentUserId: number;
  isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  
  const canDelete = userId === currentUserId || isAdmin;

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${postId}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete post" }));
        throw new Error(error.message || "Failed to delete post");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Post deleted successfully" });
      // Invalidate queries to refresh the post list
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete post"
      });
    }
  });

  const handleDelete = async () => {
    try {
      await deletePostMutation.mutateAsync();
      setIsOpen(false);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  const handleCopy = () => {
    // We don't have direct access to post content here,
    // so we'll need to use an alternative approach.
    const postElement = document.getElementById(`post-${postId}`);
    if (postElement) {
      const content = postElement.querySelector('p')?.textContent || '';
      navigator.clipboard.writeText(content);
      toast({ description: "Post content copied to clipboard" });
    }
    setIsOpen(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 absolute top-3 right-3">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="bg-white rounded-t-xl overflow-hidden shadow-lg">
          <div className="flex flex-col w-full">
            <div className="text-center py-3 border-b border-gray-200 font-semibold text-lg">
              Post Options
            </div>
            
            {canDelete && (
              <button
                className="w-full p-4 text-red-500 font-semibold flex justify-center border-b hover:bg-gray-50"
                onClick={handleDelete}
                disabled={deletePostMutation.isPending}
              >
                {deletePostMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            )}
            
            <button
              className="w-full p-4 text-gray-700 font-semibold flex justify-center border-b hover:bg-gray-50"
              onClick={handleCopy}
            >
              Copy
            </button>
            
            <button
              className="w-full p-4 bg-gray-200 text-gray-700 font-semibold flex justify-center mt-2 mb-safe"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
