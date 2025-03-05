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

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  console.log("=== CommentsPage Mount ===");
  console.log("Current location:", location);
  console.log("PostID from params:", postId);
  console.log("Current user:", user?.id);

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
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
    },
    enabled: Boolean(postId)
  });

  // Fetch comments
  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError } = useQuery({
    queryKey: ["/api/posts/comments", postId],
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
    },
    enabled: Boolean(postId)
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      console.log("Creating comment for post:", postId);
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: content.trim(),
        parentId: parseInt(postId!),
        points: 1
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
      console.error("Error creating comment:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment",
      });
    },
  });

  // Print current state for debugging
  console.log("=== Current State ===");
  console.log("Post:", originalPost);
  console.log("Comments:", comments);
  console.log("Loading states:", { isPostLoading, areCommentsLoading });
  console.log("Errors:", { postError, commentsError });

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
    console.error("Render Error:", error);
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-destructive">
          <p>{error?.message || "An error occurred"}</p>
        </div>
      </AppLayout>
    );
  }

  if (!originalPost) {
    console.log("No post data available");
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  console.log("=== Rendering Comments View ===");
  console.log("Post data:", originalPost);
  console.log("Comments data:", comments);

  return (
    <AppLayout title="Comments">
      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-32">
        <PostView post={originalPost} />
        <CommentList comments={comments} />
        <CommentForm
          onSubmit={async (content) => {
            await createCommentMutation.mutateAsync(content);
          }}
          isSubmitting={createCommentMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}