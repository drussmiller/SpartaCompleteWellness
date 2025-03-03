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

// This component shows multiple reaction emojis with counts
function ReactionSummary({ postId }: { postId: number }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReactionType, setSelectedReactionType] = useState<string | null>(null);

  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
  });

  // Count each type of reaction
  const reactionCounts: Record<string, number> = {};
  reactions.forEach(reaction => {
    if (reaction.type) {
      reactionCounts[reaction.type] = (reactionCounts[reaction.type] || 0) + 1;
    }
  });

  const getEmojiForType = (type: string) => {
    const allEmojis = {
      // Love
      heart: { emoji: "❤️", color: "text-red-500" },
      fire: { emoji: "🔥", color: "text-orange-500" },
      smiling_face: { emoji: "😊", color: "text-yellow-500" },

      // Encouragement
      clap: { emoji: "👏", color: "text-amber-500" },
      muscle: { emoji: "💪", color: "text-blue-500" },
      thumbs_up: { emoji: "👍", color: "text-blue-500" },

      // Sporty
      basketball: { emoji: "🏀", color: "text-orange-500" },
      running: { emoji: "🏃", color: "text-green-500" },
      weight: { emoji: "🏋️", color: "text-stone-500" },

      // Spiritual
      angel: { emoji: "😇", color: "text-sky-500" },
      dove: { emoji: "🕊️", color: "text-sky-500" },
      church: { emoji: "⛪", color: "text-slate-500" },
      bible: { emoji: "📖", color: "text-amber-500" },
      cross: { emoji: "✝️", color: "text-red-500" },
      faith: { emoji: "🙌", color: "text-amber-500" },
      idea: { emoji: "💡", color: "text-yellow-500" },
      rocket: { emoji: "🚀", color: "text-indigo-500" },
      sparkles: { emoji: "✨", color: "text-purple-500" },
    };

    return allEmojis[type]?.emoji || "👍";
  };

  // Sort reaction types by count (most frequent first)
  const sortedReactions = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Show at most 5 reaction types

  const handleReactionClick = (type: string) => {
    setSelectedReactionType(type);
    setDrawerOpen(true);
  };

  if (sortedReactions.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1 text-sm">
        <TooltipProvider>
          <div className="flex flex-wrap gap-1">
            {sortedReactions.map(([type, count]) => (
              <Tooltip key={type}>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => handleReactionClick(type)}
                    className="flex items-center bg-muted rounded-full px-2 py-0.5 hover:bg-muted/80"
                  >
                    <span>{getEmojiForType(type)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{type.replace('_', ' ')}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
      <UserReactionsDrawer 
        postId={postId}
        reactionType={selectedReactionType}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}

// Placeholder for UserReactionsDrawer component
const UserReactionsDrawer = ({ postId, reactionType, isOpen, onClose }: { postId: number; reactionType: string | null; isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div>
      {/* Implementation for UserReactionsDrawer goes here */}
      <h2>Reactions for {reactionType} on Post ID: {postId}</h2>
      <button onClick={onClose}>Close</button>
    </div>
  );
};


export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost; // Added for clarity;  Could be a more complex condition later

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
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] }); //Invalidate cache
    },
    onSuccess: () => {
      console.log("Post deleted successfully!");
    },
    onError: (error) => {
      console.error("Error deleting post:", error);
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