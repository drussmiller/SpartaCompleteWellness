import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { Post, User } from "@shared/schema";
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

  console.log("\n=== Comment Drawer Mount ===");
  console.log("PostID:", postId);
  console.log("Is Open:", isOpen);

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
    enabled: isOpen && Boolean(postId),
    queryFn: async () => {
      console.log("Fetching post data for ID:", postId);
      try {
        const res = await apiRequest("GET", `/api/posts/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        console.log("Post data received:", data);
        return data;
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
    staleTime: 1000, // Consider data fresh for 1 second
    queryFn: async () => {
      console.log("Fetching comments for post:", postId);
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        console.log("Comments data received:", data);
        return data;
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
      console.log("Creating comment with data:", data);
      const res = await apiRequest("POST", "/api/posts", {
        data: JSON.stringify(data)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error creating comment:", errorText);
        throw new Error(errorText);
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
      console.error("Comment posting error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment",
      });
    },
  });

  // Print current state for debugging
  console.log("=== Comment Drawer State ===");
  console.log("Post:", originalPost);
  console.log("Comments:", comments);
  console.log("Loading states:", { isPostLoading, areCommentsLoading });
  console.log("Errors:", { postError, commentsError });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[500px] p-0 fixed inset-0 z-[9999]"
      >
        <div className="h-[100dvh] flex flex-col overflow-hidden">
          <SheetClose className="absolute top-4 left-4 p-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 bg-background shadow-sm z-[10000]">
            <span className="text-2xl">&lt;</span>
            <span className="sr-only">Close</span>
          </SheetClose>
          {/* Show loading state */}
          {(isPostLoading || areCommentsLoading) && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}

          {/* Show errors if any */}
          {(postError || commentsError) && (
            <div className="flex-1 flex items-center justify-center text-destructive">
              <p>{postError?.message || commentsError?.message || "Failed to load content"}</p>
            </div>
          )}

          {/* Post and comments section with scrolling */}
          {!isPostLoading && !areCommentsLoading && !postError && !commentsError && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
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