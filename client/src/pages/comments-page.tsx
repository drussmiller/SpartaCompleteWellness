import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Send, Loader2, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";

type PostWithAuthor = Post & {
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: PostWithAuthor[];
  depth?: number;
};

export function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<{ id: number | null; username: string | null }>({
    id: null,
    username: null,
  });

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
        parentId: replyTo.id || Number(postId),
        depth: replyTo.id ? 1 : 0,
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
        description: replyTo.id ? "Reply added successfully" : "Comment added successfully"
      });
      setComment("");
      setReplyTo({ id: null, username: null });
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

  const renderComment = (comment: PostWithAuthor, depth = 0) => (
    <div 
      key={comment.id} 
      className={`flex flex-col space-y-2 ${depth > 0 ? 'ml-8 pl-4 border-l border-border' : ''}`}
    >
      <div className="flex items-start space-x-3">
        <Avatar className="h-8 w-8">
          <AvatarImage 
            src={comment.author?.imageUrl || undefined} 
            alt={comment.author?.username || ''} 
          />
          <AvatarFallback>
            {comment.author?.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="rounded-lg bg-muted p-3">
            <span className="font-semibold">{comment.author?.username}</span>
            <p className="text-sm mt-1">{comment.content}</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4"
            >
              <Heart className="h-4 w-4 mr-1" />
              Like
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4"
              onClick={() => setReplyTo({ 
                id: comment.id, 
                username: comment.author?.username || null 
              })}
            >
              Reply
            </Button>
          </div>
        </div>
      </div>
      {comment.replies?.map(reply => renderComment(reply, depth + 1))}
    </div>
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to view comments.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container max-w-2xl mx-auto flex-1 pb-24">
        <div className="p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            className="mr-2"
          >
            &lt;
          </Button>
          <h1 className="font-bold text-xl inline-block">Comments</h1>
        </div>

        {postQuery.isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : postQuery.error ? (
          <div className="p-4 text-destructive">
            {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
          </div>
        ) : postQuery.data && (
          <div className="mb-6">
            <div className="flex items-start space-x-3 p-4">
              <Avatar className="h-10 w-10">
                <AvatarImage 
                  src={postQuery.data.author?.imageUrl || undefined} 
                  alt={postQuery.data.author?.username || ''} 
                />
                <AvatarFallback>
                  {postQuery.data.author?.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-semibold">{postQuery.data.author?.username}</div>
                <p className="mt-1">{postQuery.data.content}</p>
              </div>
            </div>
            {postQuery.data.imageUrl && (
              <img
                src={postQuery.data.imageUrl}
                alt="Post image"
                className="w-full object-contain max-h-[70vh]"
              />
            )}
          </div>
        )}

        <div className="divide-y divide-border">
          <h2 className="font-semibold text-lg p-4">Comments</h2>

          {commentsQuery.isLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : commentsQuery.error ? (
            <div className="text-destructive p-4">
              Error loading comments: {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Unknown error'}
            </div>
          ) : commentsQuery.data?.length === 0 ? (
            <div className="text-center text-muted-foreground p-4">No comments yet. Be the first to comment!</div>
          ) : (
            <div className="space-y-6 p-4">
              {commentsQuery.data?.map(comment => renderComment(comment))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="container max-w-2xl mx-auto">
          {replyTo.id && (
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-muted-foreground">
                Replying to <span className="font-medium">{replyTo.username}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyTo({ id: null, username: null })}
              >
                Cancel
              </Button>
            </div>
          )}
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
              placeholder={replyTo.id ? "Write a reply..." : "Add a comment..."}
              className="flex-1"
            />
            <Button 
              type="submit"
              disabled={!comment.trim() || addCommentMutation.isPending}
              size="icon"
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}