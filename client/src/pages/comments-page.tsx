import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  const numericPostId = parseInt(postId || '0', 10);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  console.log("=== CommentsPage Debug ===");
  console.log("Current postId:", postId);
  console.log("Numeric postId:", numericPostId);
  console.log("Current user:", currentUser?.id);

  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: [`/api/posts/${numericPostId}`],
    queryFn: async () => {
      console.log("Fetching post with ID:", numericPostId);
      const res = await apiRequest("GET", `/api/posts/${numericPostId}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch post:", errorText);
        throw new Error(`Failed to fetch post: ${errorText}`);
      }
      const data = await res.json();
      console.log("Received post data:", data);
      return data;
    },
    enabled: !!numericPostId,
  });

  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError, refetch } = useQuery({
    queryKey: [`/api/posts/comments/${numericPostId}`],
    queryFn: async () => {
      console.log("Fetching comments for post:", numericPostId);
      const res = await apiRequest("GET", `/api/posts/comments/${numericPostId}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch comments:", errorText);
        throw new Error(`Failed to fetch comments: ${errorText}`);
      }
      const data = await res.json();
      console.log("Received comments data:", data);
      return data;
    },
    enabled: !!numericPostId,
  });

  console.log("=== Current State ===");
  console.log("Loading states:", { isPostLoading, areCommentsLoading });
  console.log("Errors:", { postError, commentsError });
  console.log("Data:", { originalPost, commentsCount: comments?.length });

  if (!currentUser) {
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <p>Please log in to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isPostLoading || areCommentsLoading) {
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (postError || commentsError) {
    console.error("=== Comments Page Error ===");
    console.error(postError || commentsError);
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center text-destructive">
          <p>{(postError || commentsError)?.message}</p>
        </div>
      </AppLayout>
    );
  }

  if (!originalPost) {
    console.log("No post found");
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  console.log("Rendering main comments view");
  return (
    <AppLayout title="Comments">
      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-32">
        <PostView post={originalPost} />
        <CommentList comments={comments} />
        <CommentForm 
          onSubmit={content => createCommentMutation.mutate(content)}
          isSubmitting={createCommentMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}

const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: content.trim(),
        parentId: numericPostId,
        points: 1
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${numericPostId}`] });
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