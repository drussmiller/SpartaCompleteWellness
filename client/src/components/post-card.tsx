import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User, Reaction } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MessageCircle, Trash2 } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// ReactionSummary component completely refactored for array handling
function ReactionSummary({ postId }: { postId: number }) {
  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
  });

  const emojiMap = {
    like: "👍",
    love: "❤️",
    laugh: "😂",
    wow: "😮",
    sad: "😢",
    angry: "😡",
    celebrate: "🎉",
    clap: "👏",
    fire: "🔥",
    pray: "🙏",
    support: "🤗",
    muscle: "💪",
    star: "⭐",
    heart_eyes: "😍",
    raised_hands: "🙌",
    trophy: "🏆",
    thumbs_down: "👎",
    salad: "🥗",
    fruit: "🍎",
    water: "💧",
    run: "🏃",
    bike: "🚴",
    weight: "🏋️",
    angel: "😇",
    dove: "🕊️",
    church: "⛪",
    idea: "💡",
    rocket: "🚀",
    sparkles: "✨"
  };

  // Group reactions by type and count them
  const reactionsByType = reactions.reduce((acc: { [key: string]: number }, reaction) => {
    if (reaction.type) {
      acc[reaction.type] = (acc[reaction.type] || 0) + 1;
    }
    return acc;
  }, {});

  // Convert to array and sort by count
  const sortedReactions = Object.entries(reactionsByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  if (sortedReactions.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      {sortedReactions.map(([type, count]) => (
        <TooltipProvider key={type}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center bg-muted rounded-full px-2 py-0.5">
                <span className="mr-1">{emojiMap[type as keyof typeof emojiMap] || "👍"}</span>
                <span className="text-xs">{count}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{type.replace('_', ' ')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}

export function PostCard({ post }: { post: Post & { author?: User | null } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost;

  // Get safe values with fallbacks
  const authorUsername = post.author?.username || 'Unknown User';
  const authorPoints = post.author?.points || 0;
  const authorFirstLetter = authorUsername[0]?.toUpperCase() || '?';

  const { data: commentCount = 0 } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        if (!post.id) return 0;
        const res = await apiRequest("GET", `/api/posts/comments/${post.id}?count=true`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const count = await res.json();
        return count || 0;
      } catch (error) {
        console.error("Error fetching comment count:", error);
        return 0;
      }
    },
    staleTime: 1000,
    refetchInterval: 3000
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/posts/${post.id}`);
      // Invalidate all relevant queries to refresh the data
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
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${authorUsername}`} 
            />
            <AvatarFallback>{authorFirstLetter}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{authorUsername}</p>
            <p className="text-sm text-muted-foreground">{authorPoints} points</p>
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

          {/* Reaction summary display */}
          <ReactionSummary postId={post.id} />

          <div className="flex items-center gap-2">
            <ReactionButton postId={post.id} />
            <Link href={`/comments/${post.id}`}>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <MessageCircle className="h-4 w-4" />
                {commentCount}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}