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
import { cn } from "@/lib/utils";
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

  // Wellness & Fitness
  celebrate: { emoji: "🎉", color: "text-purple-500" },
  clap: { emoji: "👏", color: "text-yellow-500" },
  fire: { emoji: "🔥", color: "text-orange-500" },
  pray: { emoji: "🙏", color: "text-amber-500" },
  support: { emoji: "🤗", color: "text-green-500" },
  muscle: { emoji: "💪", color: "text-blue-500" },

  // Additional positive emojis
  star: { emoji: "⭐", color: "text-yellow-500" },
  heart_eyes: { emoji: "😍", color: "text-red-500" },
  raised_hands: { emoji: "🙌", color: "text-amber-500" },
  trophy: { emoji: "🏆", color: "text-yellow-500" },
  thumbs_down: { emoji: "👎", color: "text-slate-500" },

  // Food related
  salad: { emoji: "🥗", color: "text-green-500" },
  fruit: { emoji: "🍎", color: "text-red-500" },
  water: { emoji: "💧", color: "text-blue-500" },

  // Exercise related
  run: { emoji: "🏃", color: "text-purple-500" },
  bike: { emoji: "🚴", color: "text-green-500" },
  weight: { emoji: "🏋️", color: "text-indigo-500" },

  // Spiritual
  angel: { emoji: "😇", color: "text-sky-500" },
  dove: { emoji: "🕊️", color: "text-white-500" },
  church: { emoji: "⛪", color: "text-stone-500" },

  // Motivational
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
  church: "Faith",
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

  const { data: reactions = [] } = useQuery<Reaction[]>({
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
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reactionCounts = reactions.reduce((acc: Record<ReactionType, number>, reaction) => {
    if (reaction.type in reactionEmojis) {
      acc[reaction.type as ReactionType] = (acc[reaction.type as ReactionType] || 0) + 1;
    }
    return acc;
  }, {} as Record<ReactionType, number>);

  const handleReaction = (type: ReactionType) => {
    const hasReacted = reactions.some((r) => r.type === type && r.userId === Number(localStorage.getItem('userId')));
    if (hasReacted) {
      removeReactionMutation.mutate(type);
    } else {
      addReactionMutation.mutate(type);
    }
    setIsOpen(false);
  };

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  // Get the most common reaction type to display if any exist
  let mostCommonReaction: ReactionType | null = null;
  let maxCount = 0;

  Object.entries(reactionCounts).forEach(([type, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonReaction = type as ReactionType;
    }
  });

  // Get user's reaction if any
  const userReaction = reactions.find(r => r.userId === Number(localStorage.getItem('userId')))?.type as ReactionType | undefined;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
        >
          <ThumbsUp className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-2 grid grid-cols-6 gap-1 w-60">
        {Object.entries(reactionEmojis).map(([type, { emoji }]) => (
          <DropdownMenuItem
            key={type}
            className="flex-col gap-1 px-2 py-2 cursor-pointer hover:bg-muted"
            onClick={() => handleReaction(type as ReactionType)}
          >
            <span className="text-lg">{emoji}</span>
            <span className="text-xs">{reactionLabels[type as ReactionType]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}