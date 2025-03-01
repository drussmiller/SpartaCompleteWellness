import { useState } from "react";
import { useNavigate } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post } from "@shared/schema";
import { formatDistance } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PostOptionsMenu } from "./post-options-menu";

type PostCardProps = {
  post: Post & {
    author?: {
      id: number;
      username: string;
      imageUrl?: string;
    };
    commentCount?: number;
  };
  onDelete?: () => void;
};

export function PostCard({ post, onDelete }: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useNavigate();

  const isOwnPost = user?.id === post.userId;
  const isAdmin = user?.isAdmin;
  const canDelete = isOwnPost || isAdmin;

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${post.id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete post" }));
        throw new Error(error.message || "Failed to delete post");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Post deleted successfully" });
      if (onDelete) onDelete();
      // Invalidate queries to refresh the post list
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete post"
      });
    }
  });

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      deletePostMutation.mutate();
    }
  };

  const openComments = () => {
    // Navigate to the comments page with the post ID
    navigate(`/comments/${post.id}`);
  };

  return (
    <div className="p-4 border rounded-lg bg-white mb-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} />
          <AvatarFallback>{post.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="font-medium">{post.author?.username}</div>
            {post.type !== "comment" && canDelete && (
              <PostOptionsMenu 
                onEdit={() => {}} 
                onDelete={handleDelete} 
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {post.createdAt && new Date(post.createdAt).toLocaleString()}
          </p>
          {post.type !== "comment" && (
            <Badge variant="outline" className="mt-1 text-xs">
              {post.type}
            </Badge>
          )}
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">
            {post.content}
          </p>
          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt="Post"
              className="mt-2 rounded-md max-h-[300px] w-auto"
            />
          )}

          {post.type !== "comment" && (
            <div className="flex items-center mt-3 gap-2">
              <button
                onClick={openComments}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Comment{post.commentCount && post.commentCount > 0 ? ` (${post.commentCount})` : ""}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}