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
  post: Post;
  postId: number;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

export function CommentDrawer({ post, postId, onOpenChange, open }: CommentDrawerProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error(`Failed to load comments (${res.status})`);
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("Error loading comments:", error);
        return [];
      }
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      const res = await apiRequest("POST", `/api/posts/comments/${postId}`, { content });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0 bg-background">
        <div className="flex flex-col h-[100dvh]">
          <div className="border-b">
            <div className="p-4 flex items-center gap-2">
              <SheetClose className="rounded-full hover:bg-accent p-2">
                <ChevronLeft className="h-5 w-5" />
              </SheetClose>
              <h2 className="font-semibold">Comments</h2>
            </div>
            <PostView post={post} />
          </div>

          <div className="flex-1 overflow-auto">
            {isLoadingComments ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <CommentList comments={comments} postId={postId} />
            )}
          </div>

          {user && (
            <div className="border-t p-4 bg-background">
              <CommentForm
                onSubmit={async (content) => {
                  await createCommentMutation.mutateAsync({ content });
                }}
                isSubmitting={createCommentMutation.isPending}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}