import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch post");
      return res.json();
    },
  });

  const commentsQuery = useQuery({
    queryKey: ["comments", postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) {
      addCommentMutation.mutate();
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background p-4 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => window.history.back()}
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Comments</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {postQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading post...</div>
        ) : postQuery.error ? (
          <div className="text-red-500 p-4">Error loading post: {postQuery.error.message}</div>
        ) : (
          <div className="mb-6">
            <div className="flex items-start space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={postQuery.data.author?.imageUrl} alt={postQuery.data.author?.username} />
                <AvatarFallback>{postQuery.data.author?.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{postQuery.data.author?.username}</div>
                <p className="mt-1">{postQuery.data.content}</p>
                {postQuery.data.imageUrl && (
                  <img
                    src={postQuery.data.imageUrl}
                    alt="Post image"
                    className="mt-2 rounded-md max-h-72 object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <h2 className="font-semibold text-lg mb-4">Comments</h2>

        {commentsQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading comments...</div>
        ) : commentsQuery.error ? (
          <div className="text-red-500 p-4">Error loading comments: {commentsQuery.error.message}</div>
        ) : commentsQuery.data.length === 0 ? (
          <div className="text-center text-gray-500 p-4">No comments yet. Be the first to comment!</div>
        ) : (
          <div className="space-y-4">
            {commentsQuery.data.map((comment: Post) => (
              <div key={comment.id} className="flex items-start space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={comment.author?.imageUrl} alt={comment.author?.username} />
                  <AvatarFallback>{comment.author?.username?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold">{comment.author?.username}</div>
                  <p className="mt-1">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {user && (
        <div className="sticky bottom-0 border-t bg-background p-4">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={user?.imageUrl} alt={user?.username} />
              <AvatarFallback>{user?.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <Input
              placeholder="Add a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!comment.trim() || addCommentMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}