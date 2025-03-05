import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { Post, User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CommentDrawerProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentDrawer({ postId, isOpen, onClose }: CommentDrawerProps) {
  const { toast } = useToast();

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading } = useQuery({
    queryKey: ["/api/posts", postId],
    enabled: isOpen,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Fetch comments
  const { data: comments = [], isLoading: areCommentsLoading } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    enabled: isOpen,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: content.trim(),
        parentId: postId,
        points: 1
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        description: "Comment posted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment",
      });
    },
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[500px] p-0">
        <div className="h-full flex flex-col overflow-hidden">
          {/* Post and comments section with scrolling */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {originalPost && <PostView post={originalPost} />}
            <CommentList comments={comments} />
          </div>
          
          {/* Fixed comment form at bottom */}
          <div className="border-t bg-background p-4">
            <CommentForm
              onSubmit={async (content) => {
                await createCommentMutation.mutateAsync(content);
              }}
              isSubmitting={createCommentMutation.isPending}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
