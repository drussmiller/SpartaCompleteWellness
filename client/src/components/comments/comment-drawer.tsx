import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { Post } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useRef, useEffect } from "react";

interface CommentDrawerProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentDrawer({ postId, isOpen, onClose }: CommentDrawerProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus on the comment input when the drawer opens
  useEffect(() => {
    if (isOpen && commentInputRef.current) {
      // Try multiple times with increasing delays to ensure focus works
      const attempts = [10, 100, 300, 500, 1000];
      attempts.forEach(delay => {
        setTimeout(() => {
          if (commentInputRef.current) {
            commentInputRef.current.focus();
            console.log(`Attempting to focus at ${delay}ms`);
          }
        }, delay);
      });
    }
  }, [isOpen]);

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
        onOpenAutoFocus={(e) => {
          // Prevent default autofocus and handle it ourselves
          e.preventDefault();
          setTimeout(() => {
            if (commentInputRef.current) {
              commentInputRef.current.focus();
              console.log("Focus on transition end");
            }
          }, 100);
        }}
      >
        <div className="h-[100dvh] flex flex-col overflow-hidden w-full">
          {/* Fixed header bar */}
          <div className="h-20 border-b bg-background fixed top-0 left-0 right-0 z-[10000]">
            {/* Back button */}
            <SheetClose className="absolute top-7 left-4 p-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <ChevronLeft className="text-xl" />
              <span className="sr-only">Close</span>
            </SheetClose>

            {/* Post author info */}
            {originalPost?.author && (
              <div className="flex flex-col items-start justify-center h-full ml-14">
                {/* User info and time */}
                <div className="flex items-center gap-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={originalPost.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author.username}`}
                      alt={originalPost.author.username}
                    />
                    <AvatarFallback>
                      {originalPost.author.username?.[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xl font-semibold">{originalPost.author.username}</span>
                  {originalPost?.createdAt && (
                    <>
                      <span className="text-muted-foreground">-</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(originalPost.createdAt), { addSuffix: false })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Content area - adjust top margin to account for header */}
          <div className="flex-1 overflow-hidden mt-20">
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
                <div className="flex-1 overflow-y-auto h-[calc(100vh-12rem)] p-4 space-y-6">
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
                    ref={commentInputRef}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}