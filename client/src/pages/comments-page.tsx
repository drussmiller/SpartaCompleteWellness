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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  console.log('Comments Page - Post ID:', postId, 'Numeric ID:', numericPostId);

  // Fetch original post
  const { data: post, isLoading: isLoadingPost, error: postError } = useQuery({
    queryKey: [`/api/posts/${numericPostId}`],
    queryFn: async () => {
      console.log('Fetching post:', numericPostId);
      const res = await apiRequest("GET", `/api/posts/${numericPostId}`);
      if (!res.ok) throw new Error("Failed to fetch post");
      const data = await res.json();
      console.log('Post data:', data);
      return data;
    },
    enabled: !!numericPostId && numericPostId > 0
  });

  // Fetch comments
  const { data: comments = [], isLoading: isLoadingComments, error: commentsError } = useQuery({
    queryKey: [`/api/posts/comments/${numericPostId}`],
    queryFn: async () => {
      console.log('Fetching comments for post:', numericPostId);
      const res = await apiRequest("GET", `/api/posts/comments/${numericPostId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      const data = await res.json();
      console.log('Comments data:', data);
      return data;
    },
    enabled: !!numericPostId && numericPostId > 0
  });

  // Create comment mutation
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

  // Invalid post ID
  if (!numericPostId || numericPostId <= 0) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Invalid post ID</p>
        </div>
      </AppLayout>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Please login to view comments</p>
        </div>
      </AppLayout>
    );
  }

  // Loading state
  if (isLoadingPost || isLoadingComments) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  // Error state
  if (postError || commentsError) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-destructive">
          <p>{(postError || commentsError)?.message}</p>
        </div>
      </AppLayout>
    );
  }

  // No post found
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