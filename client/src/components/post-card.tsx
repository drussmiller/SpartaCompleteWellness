import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User, Reaction } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MessageCircle, Trash2, X } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// This component shows multiple reaction emojis with counts
function ReactionSummary({ postId }: { postId: number }) {
  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
  });
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const [selectedReactionType, setSelectedReactionType] = useState<string | null>(null);
  const [showReactionUsers, setShowReactionUsers] = useState(false);

  // Count reactions by type
  const reactionCounts: Record<string, number> = {};
  reactions.forEach((reaction) => {
    if (!reactionCounts[reaction.type]) {
      reactionCounts[reaction.type] = 0;
    }
    reactionCounts[reaction.type]++;
  });

  // Get the emoji for a reaction type
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

  // Get users who reacted with a specific type
  const getUsersForReactionType = (type: string) => {
    const userIds = reactions
      .filter(reaction => reaction.type === type)
      .map(reaction => reaction.userId);

    return users.filter(user => userIds.includes(user.id));
  };

  // Sort reaction types by count (most frequent first)
  const sortedReactions = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Show at most 5 reaction types

  if (sortedReactions.length === 0) return null;

  const handleEmojiClick = (type: string) => {
    setSelectedReactionType(type);
    setShowReactionUsers(true);
  };

  const closeUserDrawer = () => {
    setShowReactionUsers(false);
  };

  return (
    <>
      <div className="flex items-center gap-1 text-sm">
        <div className="flex flex-wrap gap-1">
          {sortedReactions.map(([type, count]) => (
            <div 
              key={type} 
              className="flex items-center bg-muted rounded-full px-2 py-0.5 cursor-pointer"
              onClick={() => handleEmojiClick(type)}
            >
              <span className="mr-1">{getEmojiForType(type)}</span>
              {/* Removed count display */}
            </div>
          ))}
        </div>
      </div>

      {/* Drawer to show users who reacted */}
      {showReactionUsers && selectedReactionType && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center pb-[96px]" onClick={closeUserDrawer}>
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
          <div 
            className="relative w-full max-w-md rounded-t-lg bg-background p-4 shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">
                {getEmojiForType(selectedReactionType)} {selectedReactionType.replace('_', ' ')}
              </h3>
              <Button variant="ghost" size="sm" onClick={closeUserDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {getUsersForReactionType(selectedReactionType).map(user => (
                <div key={user.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.imageUrl || undefined} alt={user.username} />
                    <AvatarFallback>{(user.username || "").substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span>{user.preferredName || user.username}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

          <div className="flex items-center space-x-2">
            <ReactionButton postId={post.id} />
            <Link href={`/comments/${post.id}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-sm">
                <MessageCircle className="h-4 w-4" />
                {commentCount || ''}
              </Button>
            </Link>
          </div>
          <div className="mt-2">
            <ReactionSummary postId={post.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}