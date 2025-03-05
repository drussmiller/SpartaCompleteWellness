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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";

function ReactionSummary({ postId }: { postId: number }) {
  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 30000, // Consider data fresh for 30 seconds
    cacheTime: 60000, // Keep in cache for 1 minute
  });

  const reactionCounts: Record<string, number> = {};
  reactions.forEach(reaction => {
    if (reaction.type) {
      reactionCounts[reaction.type] = (reactionCounts[reaction.type] || 0) + 1;
    }
  });

  const getEmojiForType = (type: string): string => {
    const allEmojis: Record<string, { emoji: string, color: string }> = {
      like: { emoji: "👍", color: "text-blue-500" },
      love: { emoji: "❤️", color: "text-red-500" },
      laugh: { emoji: "😂", color: "text-yellow-500" },
      wow: { emoji: "😮", color: "text-yellow-500" },
      sad: { emoji: "😢", color: "text-blue-500" },
      angry: { emoji: "😡", color: "text-red-500" },
      celebrate: { emoji: "🎉", color: "text-purple-500" },
      clap: { emoji: "👏", color: "text-yellow-500" },
      fire: { emoji: "🔥", color: "text-orange-500" },
      pray: { emoji: "🙏", color: "text-amber-500" },
      support: { emoji: "🤗", color: "text-green-500" },
      muscle: { emoji: "💪", color: "text-blue-500" },
      star: { emoji: "⭐", color: "text-yellow-500" },
      heart_eyes: { emoji: "😍", color: "text-red-500" },
      raised_hands: { emoji: "🙌", color: "text-amber-500" },
      trophy: { emoji: "🏆", color: "text-yellow-500" },
      thumbs_down: { emoji: "👎", color: "text-slate-500" },
      salad: { emoji: "🥗", color: "text-green-500" },
      fruit: { emoji: "🍎", color: "text-red-500" },
      water: { emoji: "💧", color: "text-blue-500" },
      run: { emoji: "🏃", color: "text-purple-500" },
      bike: { emoji: "🚴", color: "text-green-500" },
      weight: { emoji: "🏋️", color: "text-indigo-500" },
      angel: { emoji: "😇", color: "text-sky-500" },
      dove: { emoji: "🕊️", color: "text-white-500" },
      church: { emoji: "⛪", color: "text-stone-500" },
      idea: { emoji: "💡", color: "text-yellow-500" },
      rocket: { emoji: "🚀", color: "text-indigo-500" },
      sparkles: { emoji: "✨", color: "text-purple-500" },
    };

    return allEmojis[type]?.emoji || "👍";
  };

  const sortedReactions = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); 

  if (sortedReactions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      <TooltipProvider>
        <div className="flex flex-wrap gap-1">
          {sortedReactions.map(([type, count]) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <div className="flex items-center bg-muted rounded-full px-2 py-0.5">
                  <span>{getEmojiForType(type)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{type.replace('_', ' ')}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

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

          <ReactionSummary postId={post.id} />

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