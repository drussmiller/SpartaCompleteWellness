import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useToast } from "@/hooks/use-toast";
import { PostView } from "@/components/comments/post-view";
import { CommentList } from "@/components/comments/comment-list";
import { CommentForm } from "@/components/comments/comment-form";

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  console.log("Rendering CommentsPage with postId:", postId);

  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      console.log("Fetching post with ID:", postId);
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch post:", errorText);
        throw new Error(`Failed to fetch post: ${errorText}`);
      }
      const data = await res.json();
      console.log("Post data received:", data);
      return data;
    },
    enabled: Boolean(postId)
  });

  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      console.log("Fetching comments for post:", postId);
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch comments:", errorText);
        throw new Error(`Failed to fetch comments: ${errorText}`);
      }
      const data = await res.json();
      console.log("Comments data received:", data);
      return data;
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
        const error = await res.json();
        throw new Error(error.message || "Failed to create comment");
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

  console.log("Current state:", {
    postId,
    hasPost: !!originalPost,
    commentsCount: comments?.length,
    isLoading: isPostLoading || areCommentsLoading,
    errors: { postError, commentsError }
  });

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
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-destructive">
          <p>{(postError || commentsError)?.message}</p>
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