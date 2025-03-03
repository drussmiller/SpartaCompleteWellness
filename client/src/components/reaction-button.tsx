import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Reaction } from "@shared/schema";

const reactionEmojis = {
  // Basic reactions
  like: { emoji: "👍", color: "text-blue-500" },
  love: { emoji: "❤️", color: "text-red-500" },
  laugh: { emoji: "😂", color: "text-yellow-500" },
  wow: { emoji: "😮", color: "text-yellow-500" },
  sad: { emoji: "😢", color: "text-blue-500" },
  angry: { emoji: "😡", color: "text-red-500" },
  // Rest of your emoji definitions...
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
  dove: { emoji: "🕊️", color: "text-sky-500" },
  church: { emoji: "⛪", color: "text-slate-500" },
  bible: { emoji: "📖", color: "text-amber-500" },
  cross: { emoji: "✝️", color: "text-red-500" },
  faith: { emoji: "🙌", color: "text-amber-500" },
  idea: { emoji: "💡", color: "text-yellow-500" },
  rocket: { emoji: "🚀", color: "text-indigo-500" },
  sparkles: { emoji: "✨", color: "text-purple-500" },
} as const;

const reactionLabels = {
  like: "Like",
  love: "Love",
  laugh: "Laugh",
  wow: "Wow",
  sad: "Sad",
  angry: "Angry",
  celebrate: "Celebrate",
  clap: "Applause",
  fire: "Fire",
  pray: "Pray",
  support: "Support",
  muscle: "Strength",
  star: "Star",
  heart_eyes: "Love it",
  raised_hands: "Praise",
  trophy: "Achievement",
  thumbs_down: "Dislike",
  salad: "Healthy Meal",
  fruit: "Fruit",
  water: "Hydration",
  run: "Running",
  bike: "Cycling",
  weight: "Weightlifting",
  angel: "Blessed",
  dove: "Peace",
  church: "Church",
  bible: "Scripture",
  cross: "Faith",
  faith: "Faith",
  idea: "Inspiration",
  rocket: "Progress",
  sparkles: "Magic",
} as const;

type ReactionType = keyof typeof reactionEmojis;

interface ReactionButtonProps {
  postId: number;
}

export function ReactionButton({ postId }: ReactionButtonProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: reactions = [], refetch: refetchReactions } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
  });

  const addReactionMutation = useMutation({
    mutationFn: async (type: ReactionType) => {
      const res = await apiRequest(
        "POST",
        `/api/posts/${postId}/reactions`,
        { type }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${postId}/reactions`] });
      // Also invalidate the post to update its reactions count
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: async (type: ReactionType) => {
      await apiRequest(
        "DELETE",
        `/api/posts/${postId}/reactions/${type}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${postId}/reactions`] });
      // Also invalidate the post to update its reactions count
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReaction = async (type: ReactionType) => {
    if (!user) return;

    const userReactions = reactions.filter(r => r.userId === user.id);
    const hasReactedWithSameType = userReactions.some(r => r.type === type);

    try {
      if (hasReactedWithSameType) {
        // Remove the reaction if clicking the same type
        await removeReactionMutation.mutateAsync(type);
      } else {
        // Remove any existing reactions from this user first
        for (const reaction of userReactions) {
          await removeReactionMutation.mutateAsync(reaction.type as ReactionType);
        }
        // Then add the new reaction
        await addReactionMutation.mutateAsync(type);
      }

      // Refetch reactions to get the updated state
      await refetchReactions();
    } catch (error) {
      console.error('Error handling reaction:', error);
    }

    setIsOpen(false);
  };

  // Get the current user's reaction if any
  const userReaction = reactions.find(r => r.userId === user?.id);
  const currentEmoji = userReaction ? reactionEmojis[userReaction.type as ReactionType]?.emoji : undefined;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={userReaction ? 'text-primary' : ''}
        >
          {currentEmoji ? (
            <span className="text-lg">{currentEmoji}</span>
          ) : (
            <ThumbsUp className="h-4 w-4" />
          )}
          <span className="ml-2">{reactions.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-2 grid grid-cols-6 gap-1 w-60">
        {Object.entries(reactionEmojis).map(([type, { emoji, color }]) => (
          <DropdownMenuItem
            key={type}
            className={`flex-col gap-1 px-2 py-2 cursor-pointer hover:bg-muted ${
              userReaction?.type === type ? color : ''
            }`}
            onClick={() => handleReaction(type as ReactionType)}
          >
            <span className="text-lg">{emoji}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}