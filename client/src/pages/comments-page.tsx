import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useToast } from "@/hooks/use-toast";
import { PostView } from "@/components/comments/post-view";
import { CommentList } from "@/components/comments/comment-list";
import { CommentForm } from "@/components/comments/comment-form";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
    enabled: Boolean(postId),
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
    enabled: Boolean(postId),
    staleTime: 60000, // Increase to 60 seconds
    refetchOnWindowFocus: false,
    refetchInterval: false, // Disable automatic periodic refetching
    refetchOnMount: "if-stale", // Only refetch on mount if data is stale
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
    mutationFn: async (data: { content: string; postId: number }) => {
      if (!user?.id) throw new Error("You must be logged in to comment");

      try {
        // Submit the comment
        const response = await apiRequest("POST", `/api/posts/comments`, {
          type: "comment",
          content: data.content,
          parentId: data.postId
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to create comment");
        }

        // Refresh the comments list
        await queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });

        return await response.json();
      } catch (error) {
        console.error("Error creating comment:", error);
        throw error;
      }
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

  if (!postId) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Invalid post ID</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Please log in to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isPostLoading || areCommentsLoading) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (postError || commentsError) {
    const error = postError || commentsError;
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-destructive">
          <p>{error?.message || "An error occurred"}</p>
        </div>
      </AppLayout>
    );
  }

  if (!originalPost) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Comments">
      <div className="h-full w-full overflow-hidden">
        <ScrollArea className="h-[calc(100vh-4rem)] w-full">
          <div className="w-full max-w-none p-4 pt-8 space-y-6 pb-48">
            <PostView post={originalPost} />
            <CommentList comments={comments} postId={parseInt(postId)} />
            {/* Only show comment form when not replying */}
            {!comments.some(comment => comment.id === comments.find(c => c.replies?.some(r => r.id === comment.id))?.id) && (
              <CommentForm
                onSubmit={async (content) => {
                  await createCommentMutation.mutateAsync({
                    content: content,
                    postId: parseInt(postId)
                  });
                }}
                isSubmitting={createCommentMutation.isPending}
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </AppLayout>
  );
}