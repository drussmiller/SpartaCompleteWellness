import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type PostWithAuthor = Post & {
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
  };
};

export function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const postQuery = useQuery<PostWithAuthor>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) throw new Error('Failed to fetch post');
      return res.json();
    },
    enabled: !!postId
  });

  const commentsQuery = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    },
    enabled: !!postId
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: comment.trim(),
        parentId: Number(postId),
        depth: 0,
        imageUrl: null
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to post comment" }));
        throw new Error(error.message || "Failed to post comment");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        description: "Comment added successfully"
      });
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to add comment"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutate();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to view comments.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto pb-20 pt-4">
      <div className="p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-bold text-xl inline-block">Comments</h1>
      </div>

      {postQuery.isLoading ? (
        <div className="flex justify-center p-4">Loading post...</div>
      ) : postQuery.error ? (
        <div className="p-4 text-destructive">
          {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
        </div>
      ) : postQuery.data && (
        <div className="mb-6 p-4">
          <div className="flex items-start space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage 
                src={postQuery.data.author?.imageUrl || undefined} 
                alt={postQuery.data.author?.username || ''} 
              />
              <AvatarFallback>
                {postQuery.data.author?.username?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold">{postQuery.data.author?.username}</div>
              <p className="mt-1">{postQuery.data.content}</p>
              {postQuery.data.imageUrl && (
                <img
                  src={postQuery.data.imageUrl}
                  alt="Post image"
                  className="mt-2 rounded-lg max-h-64 object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        <h2 className="font-semibold text-lg p-4">Comments</h2>

        {commentsQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading comments...</div>
        ) : commentsQuery.error ? (
          <div className="text-destructive p-4">
            Error loading comments: {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Unknown error'}
          </div>
        ) : commentsQuery.data?.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">No comments yet. Be the first to comment!</div>
        ) : (
          <div className="space-y-4 p-4">
            {commentsQuery.data?.map((comment) => (
              <div key={comment.id} className="flex items-start space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage 
                    src={comment.author?.imageUrl || undefined} 
                    alt={comment.author?.username || ''} 
                  />
                  <AvatarFallback>
                    {comment.author?.username?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{comment.author?.username}</div>
                  <p className="text-sm mt-1">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 border-t bg-background p-4">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage 
                src={user?.imageUrl || undefined} 
                alt={user?.username || ''} 
              />
              <AvatarFallback>
                {user?.username?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1"
            />
            <Button 
              type="submit"
              disabled={!comment.trim() || addCommentMutation.isPending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}