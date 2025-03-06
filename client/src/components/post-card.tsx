import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, Trash2 } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost;

  const { count: commentCount } = useCommentCount(post.id);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/posts/${post.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onSuccess: () => {
      console.log("Post deleted successfully!");
      toast({
        title: "Success",
        description: "Post deleted successfully",
      });
    },
    onError: (error) => {
      console.error("Error deleting post:", error);
      toast({
        title: "Error Deleting Post",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  });

  const handleDeletePost = () => {
    deletePostMutation.mutate();
  };

  return (
    <Card>
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
            <p className="font-semibold">{post.author.username}</p>
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
              className="h-6 w-6 p-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
          <div className="text-xs text-muted-foreground">
            {new Date(post.createdAt!).toLocaleString()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {post.content && (
          <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt={post.type}
            className="w-full h-auto object-contain rounded-md mb-4"
          />
        )}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {new Date(post.createdAt!).toLocaleDateString()}
            </span>
          </div>
          <div className="mt-2 border-t border-gray-200"></div>

          <div className="mt-2 flex justify-end">
            <ReactionSummary postId={post.id} />
          </div>
          <div className="mt-2 border-t border-gray-200"></div>

          <div className="mt-4 flex items-center gap-2">
            <ReactionButton postId={post.id} />
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-1.5"
              onClick={() => setIsCommentsOpen(true)}
            >
              <MessageCircle className="h-4 w-4" />
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
}