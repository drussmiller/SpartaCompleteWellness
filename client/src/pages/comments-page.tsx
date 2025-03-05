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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch original post
  const { data: post, isLoading: isLoadingPost, error: postError } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    queryFn: () => apiRequest("GET", `/api/posts/${postId}`).then(res => res.json()),
    enabled: !!postId
  });

  // Fetch comments
  const { data: comments = [], isLoading: isLoadingComments, error: commentsError } = useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: () => apiRequest("GET", `/api/posts/comments/${postId}`).then(res => res.json()),
    enabled: !!postId
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
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
      queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });
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

  if (!user) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Please login to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoadingPost || isLoadingComments) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-6 h-6 animate-spin" />
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

  if (!post) {
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
        <PostView post={post} />
        <CommentList comments={comments} />
        <CommentForm 
          onSubmit={content => createCommentMutation.mutate(content)}
          isSubmitting={createCommentMutation.isPending}
        />
      </div>
    </AppLayout>
  );
}