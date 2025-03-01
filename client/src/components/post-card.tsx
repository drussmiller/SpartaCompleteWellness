import { useState } from "react";
import { useLocation } from "wouter";
import { Heart, MessageCircle, Trash2, MoreHorizontal } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Post } from "@shared/schema";
import { formatDistance } from "date-fns";
import { Sheet, SheetContent } from "@/components/ui/sheet";

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
  const [, setLocation] = useLocation();

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

  const handleCommentClick = () => {
    setLocation(`/comments/${post.id}`);
  };

  // Show post type tag
  const getPostTypeTag = () => {
    switch (post.type) {
      case "food":
        return <span className="text-xs bg-green-100 text-green-800 rounded px-2 py-1 mr-2">Food</span>;
      case "workout":
        return <span className="text-xs bg-blue-100 text-blue-800 rounded px-2 py-1 mr-2">Workout</span>;
      case "scripture":
        return <span className="text-xs bg-purple-100 text-purple-800 rounded px-2 py-1 mr-2">Scripture</span>;
      case "memory_verse":
        return <span className="text-xs bg-yellow-100 text-yellow-800 rounded px-2 py-1 mr-2">Memory Verse</span>;
      default:
        return null;
    }
  };

  if (post.type === "comment") {
    return null; // Don't render comments in the post list
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="p-4">
        {/* Author info and options */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} />
              <AvatarFallback>{post.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{post.author?.username}</div>
              <p className="text-xs text-muted-foreground">
                {post.createdAt && formatDistance(new Date(post.createdAt), new Date(), { addSuffix: true })}
              </p>
            </div>
          </div>

          {/* Post type tag and options menu */}
          <div className="flex items-center">
            {getPostTypeTag()}

            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="text-destructive cursor-pointer"
                    onClick={() => deletePostMutation.mutate()}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Post content */}
        <div className="mb-3">
          <p className="whitespace-pre-wrap break-words">{post.content}</p>
          {post.imageUrl && (
            <div className="flex justify-center w-full mt-2">
              <img 
                src={post.imageUrl} 
                alt="Post image" 
                className="mt-2 rounded-md max-h-96 object-contain mx-auto" 
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-medium">
              {post.points && post.points > 0 ? `+${post.points} pts` : ""}
            </span>
          </div>
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center gap-1"
              onClick={handleCommentClick}
            >
              <MessageCircle className="h-4 w-4" />
              <span>{post.commentCount || 0}</span>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}