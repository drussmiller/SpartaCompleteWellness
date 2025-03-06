import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { Post } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CommentDrawerProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentDrawer({ postId, isOpen, onClose }: CommentDrawerProps) {
  const { toast } = useToast();

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
    enabled: isOpen && Boolean(postId),
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching post:", error);
        throw error;
      }
    }
  });

  // Fetch comments
  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    enabled: isOpen && Boolean(postId),
    staleTime: 1000,
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching comments:", error);
        throw error;
      }
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const data = {
        type: "comment",
        content: content.trim(),
        parentId: postId,
        points: 1
      };
      const res = await apiRequest("POST", "/api/posts", {
        data: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
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
      <SheetContent 
        side="right" 
        className="!w-full !p-0 fixed inset-0 z-[9999] !max-w-full"
        style={{ width: '100vw', maxWidth: '100vw' }}
      >
        <div className="h-[100dvh] flex flex-col overflow-hidden w-full">
          {/* Fixed header bar */}
          <div className="h-14 border-b bg-background flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-[10000]">
            <SheetClose className="p-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <span className="text-2xl">&lt;</span>
              <span className="sr-only">Close</span>
            </SheetClose>

            {/* Right side spacer */}
            <div className="w-10"></div>
          </div>

          {/* Show loading state */}
          {(isPostLoading || areCommentsLoading) && (
            <div className="flex-1 flex items-center justify-center mt-14">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}

          {/* Show errors if any */}
          {(postError || commentsError) && (
            <div className="flex-1 flex items-center justify-center text-destructive mt-14">
              <p>{postError?.message || commentsError?.message || "Failed to load content"}</p>
            </div>
          )}

          {/* Post and comments section with scrolling */}
          {!isPostLoading && !areCommentsLoading && !postError && !commentsError && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-6 mt-14">
                {originalPost && <PostView post={originalPost} />}
                <CommentList comments={comments} postId={postId} />
              </div>

              {/* Fixed comment form at the bottom */}
              <div className="p-4 border-t bg-background">
                <CommentForm
                  onSubmit={async (content) => {
                    await createCommentMutation.mutateAsync(content);
                  }}
                  isSubmitting={createCommentMutation.isPending}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}