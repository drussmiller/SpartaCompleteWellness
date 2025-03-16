import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, Trash2 } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";
import { queryClient } from "@/lib/queryClient";
import { getThumbnailUrl } from "../lib/image-utils";

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost;

  const { count: commentCount } = useCommentCount(post.id);

  const stablePost = useMemo(() => post, [post.id]);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const isOptimisticPost = typeof post.id === 'number' ? post.id > 1000000000000 : false;
      if (isOptimisticPost) {
        return post.id;
      }
      const response = await apiRequest("DELETE", `/api/posts/${post.id}`);
      if (!response.ok) {
        throw new Error(`Failed to delete post: ${response.status} ${response.statusText}`);
      }
      return post.id;
    },
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
      const previousPosts = queryClient.getQueryData(["/api/posts"]);
      queryClient.setQueryData(["/api/posts"], (old: any[]) =>
        old?.filter((p) => p.id !== post.id) || []
      );
      return { previousPosts };
    },
    onError: (error, _, context) => {
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
      queryClient.invalidateQueries({
        queryKey: ["/api/posts/counts"],
      });
    },
  });

  const handleDeletePost = () => {
    deletePostMutation.mutate();
  };

  return (
    <Card className="w-full border-0 border-b rounded-none">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2">
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
        <div className="flex items-center">
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeletePost}
              disabled={deletePostMutation.isPending}
              className="h-6 w-6 p-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pt-0 pb-2">
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
            className="w-full h-auto object-cover mb-4 cursor-pointer"
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
        )}
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <div>
              <ReactionSummary postId={post.id} />
            </div>
          </div>
          <div className="border-t border-gray-200 my-2"></div>

          <div className="flex items-center gap-2">
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
});