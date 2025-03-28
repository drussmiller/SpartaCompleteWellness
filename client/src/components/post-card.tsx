import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Post, User } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, Trash2 } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";
import { getThumbnailUrl } from "../lib/image-utils";

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost || currentUser?.isAdmin;

  const { data: dayPoints, isLoading: isLoadingPoints, error: pointsError } = useQuery({
    queryKey: ["/api/points/daily", post.createdAt],
    queryFn: async () => {
      try {
        const date = new Date(post.createdAt!);
        const response = await apiRequest(
          "GET", 
          `/api/points/daily?date=${date.toISOString()}&userId=${post.author.id}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch daily points");
        }

        const result = await response.json();
        console.log('Points API response:', {
          userId: post.author.id,
          date: date.toISOString(),
          points: result.points
        });

        return result.points;
      } catch (error) {
        console.error("Error fetching daily points:", error);
        throw error;
      }
    },
    staleTime: 300000, // Cache for 5 minutes
    retry: 2
  });

  const { count: commentCount } = useCommentCount(post.id);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await apiRequest("DELETE", `/api/posts/${post.id}`);
        if (!response.ok) {
          throw new Error("Failed to delete post");
        }
        return post.id;
      } catch (error) {
        console.error("Delete post error:", error);
        throw error;
      }
    },
    onSuccess: (deletedPostId) => {
      toast({
        title: "Success",
        description: "Post deleted successfully"
      });

      // Get current posts and filter out the deleted one
      const currentPosts = queryClient.getQueryData<(Post & { author: User })[]>(["/api/posts"]);
      if (currentPosts) {
        queryClient.setQueryData(
          ["/api/posts"],
          currentPosts.filter(p => p.id !== deletedPostId)
        );
      }

      // Force immediate refetch to ensure data consistency
      queryClient.refetchQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error) => {
      console.error("Error deleting post:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete post",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="border-y border-gray-200 bg-white w-full">
      <div className="flex flex-row items-center w-full p-4 bg-background">
        <div className="flex items-center gap-4 flex-1">
          <Avatar>
            <AvatarImage
              key={`avatar-${post.author?.id}-${avatarKey}`}
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`}
            />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{post.author.username}</p>
              <span className="text-xs text-muted-foreground">
                {(() => {
                  const diff = Date.now() - new Date(post.createdAt!).getTime();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  if (hours < 24) return `${hours}h`;
                  return `${Math.floor(hours / 24)}d`;
                })()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoadingPoints ? (
                <span className="animate-pulse">Calculating points...</span>
              ) : pointsError ? (
                <span className="text-destructive">Error loading points</span>
              ) : (
                `${dayPoints || 0} points (day's total)`
              )}
            </p>
          </div>
        </div>
        {canDelete && (
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Post</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this post? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deletePostMutation.mutate();
                    setIsDeleteDialogOpen(false);
                  }}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="px-4">
        {post.content && (
          <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
      </div>

      {post.imageUrl && (
        <div className="w-screen bg-gray-100 -mx-4 relative">
          <div className="min-h-[50vh] max-h-[90vh] w-full flex items-center justify-center py-2">
            <img
              src={getThumbnailUrl(post.imageUrl)}
              data-full-src={post.imageUrl}
              alt="Post content"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain cursor-pointer"
              onClick={(e) => {
                const fullSrc = e.currentTarget.getAttribute('data-full-src');
                if (fullSrc) {
                  window.open(fullSrc, '_blank');
                }
              }}
              onError={(e) => {
                console.error("Failed to load image:", post.imageUrl);
                const img = e.currentTarget;
                const originalSrc = img.getAttribute('data-full-src');
                if (originalSrc && originalSrc !== img.src) {
                  img.src = originalSrc;
                } else {
                  img.style.display = "none";
                }
              }}
            />
          </div>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <div>
              <ReactionSummary postId={post.id} />
            </div>
          </div>
          <div className="border-t border-gray-200"></div>

          <div className="flex items-center gap-2 py-1 h-10">
            <ReactionButton postId={post.id} variant="icon" />
            <Button
              variant="ghost"
              size="default"
              className="gap-2"
              onClick={() => setIsCommentsOpen(true)}
            >
              <MessageCircle className="h-5 w-5" />
              {commentCount}
            </Button>
          </div>
        </div>
      </div>

      <CommentDrawer
        postId={post.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
      />
    </div>
  );
});