import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

const cardStyle = {
  width: '100%',
};

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost;

  const { count: commentCount } = useCommentCount(post.id);

  // Prevent re-renders by using memo for stable references
  const stablePost = useMemo(() => post, [post.id]);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      // Check if the post ID is a number (real post) or a timestamp (optimistic update)
      const isOptimisticPost = typeof post.id === 'number' ? post.id > 1000000000000 : false;

      if (isOptimisticPost) {
        // For optimistic posts that haven't been saved to the server yet,
        // we just need to remove them from the local cache
        return post.id;
      }

      // For real posts, send delete request to the server
      const response = await apiRequest("DELETE", `/api/posts/${post.id}`);
      if (!response.ok) {
        throw new Error(`Failed to delete post: ${response.status} ${response.statusText}`);
      }
      return post.id;
    },
    onMutate: async (postId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/posts"] });

      // Snapshot the previous value
      const previousPosts = queryClient.getQueryData(["/api/posts"]);

      // Optimistically remove the post from the cache
      queryClient.setQueryData(["/api/posts"], (old: any[]) =>
        old?.filter((p) => p.id !== post.id) || []
      );

      return { previousPosts };
    },
    onError: (error, _, context) => {
      // Revert the optimistic update on error
      queryClient.setQueryData(["/api/posts"], context?.previousPosts);
      console.error("Error deleting post:", error);
      toast({
        title: "Error Deleting Post",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Post deleted successfully",
      });

      // Only invalidate the counts query after successful deletion
      queryClient.invalidateQueries({
        queryKey: ["/api/posts/counts"],
      });
    },
  });

  const handleDeletePost = () => {
    deletePostMutation.mutate();
  };

  return (
    <Card style={cardStyle} className="rounded-none">
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage
              key={`avatar-${post.author?.id}-${avatarKey}`}
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`}
            />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
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
            <p className="text-sm text-muted-foreground">{post.author.points} points</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeletePost}
              disabled={deletePostMutation.isPending}
              className="h-6 w-6 p-0 mr-4"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {post.content && (
          <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
        {post.imageUrl && (
          <img
            src={getThumbnailUrl(post.imageUrl)}
            data-full-src={post.imageUrl}
            alt="Post content"
            loading="lazy"
            decoding="async"
            className="w-screen max-w-none h-auto object-cover mb-4 cursor-pointer"
            style={{ width: 'calc(100vw - 16px)', maxHeight: '80vh', marginLeft: '-16px' }}
            onClick={(e) => {
              // Show the full-sized image when clicking on the thumbnail
              const fullSrc = e.currentTarget.getAttribute('data-full-src');
              if (fullSrc) {
                window.open(fullSrc, '_blank');
              }
            }}
            onError={(e) => {
              console.error("Failed to load image:", post.imageUrl);
              // If thumbnail fails, try the original image
              const img = e.currentTarget;
              const originalSrc = img.getAttribute('data-full-src');
              if (originalSrc && originalSrc !== img.src) {
                img.src = originalSrc;
              } else {
                img.style.display = "none";
              }
            }}
          />
        )}
        <div className="mt-4 flex flex-col gap-2">
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
      </CardContent>

      <CommentDrawer
        postId={post.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
      />
    </Card>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the post ID or content has changed
  return prevProps.post.id === nextProps.post.id && prevProps.post.content === nextProps.post.content;
});