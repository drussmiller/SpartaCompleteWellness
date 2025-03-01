
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const postQuery = useQuery<PostWithAuthor>({
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
      const res = await fetch(`/api/posts/comments/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!postId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "comment",
          content: content.trim(),
          parentId: Number(postId),
          depth: 0,
          imageUrl: null
        })
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to post comment" }));
        throw new Error(error.message || "Failed to post comment");
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
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutate(comment);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Post Details</h1>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {postQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading post...</div>
        ) : postQuery.error ? (
          <div className="text-red-500 p-4">Error loading post: {String(postQuery.error)}</div>
        ) : (
          <div className="mb-6">
            <div className="flex items-start space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarImage 
                  src={postQuery.data?.author?.imageUrl || undefined} 
                  alt={postQuery.data?.author?.username} 
                />
                <AvatarFallback>
                  {postQuery.data?.author?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">{postQuery.data?.author?.username}</div>
                <p className="mt-1">{postQuery.data?.content}</p>
                {postQuery.data?.imageUrl && (
                  <div className="mt-2 flex justify-center">
                    <img
                      src={postQuery.data.imageUrl}
                      alt="Post image"
                      className="rounded-md max-h-80 object-contain w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <h2 className="font-semibold text-lg mb-4">Comments</h2>

        {commentsQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading comments...</div>
        ) : commentsQuery.error ? (
          <div className="text-red-500 p-4">Error loading comments: {String(commentsQuery.error)}</div>
        ) : commentsQuery.data?.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No comments yet</div>
        ) : (
          <div className="space-y-4">
            {commentsQuery.data?.map((comment: any) => (
              <div key={comment.id} className="flex items-start space-x-3 pb-3 border-b">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={comment.author?.imageUrl} alt={comment.author?.username} />
                  <AvatarFallback>
                    {comment.author?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
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
        <div className="border-t p-4 bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
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
