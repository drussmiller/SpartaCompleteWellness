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
  fire: { emoji: "🔥", color: "text-orange-500" },
  pray: { emoji: "🙏", color: "text-amber-500" },
  muscle: { emoji: "💪", color: "text-blue-500" }, // Renamed from 'strength'
  thumbs_down: { emoji: "👎", color: "text-slate-500" }, // Renamed from 'dislike'green-500" },
  weight: { emoji: "🏋️", color: "text-indigo-500" },

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
} as const;

const reactionLabels = {
  like: "Like",
  love: "Love",
  laugh: "Laugh",
  wow: "Wow",
  sad: "Sad",
  angry: "Angry",
  fire: "Fire",
  pray: "Pray",
  muscle: "Strength",
  thumbs_down: "Dislike",
  faith: "Faith",
  idea: "Inspiration",
  rocket: "Progress",
  sparkles: "Magic",
} as const;

type ReactionType = keyof typeof reactionEmojis;

interface ReactionButtonProps {
  postId: number;
  variant?: 'icon' | 'text';
}

export function ReactionButton({ postId, variant = 'icon' }: ReactionButtonProps) {
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

  const handleReaction = async (type: ReactionType) => {
    if (!user?.id) return;

    // Find user's existing reaction
    const existingReaction = reactions.find(r => r.userId === user.id);

    try {
      // If user has an existing reaction and it's different from the new one
      if (existingReaction) {
        // Remove the existing reaction first
        await removeReactionMutation.mutateAsync(existingReaction.type as ReactionType);

        // If user clicked the same reaction type, don't add a new one
        if (existingReaction.type !== type) {
          await addReactionMutation.mutateAsync(type);
        }
      } else {
        // No existing reaction, just add the new one
        await addReactionMutation.mutateAsync(type);
      }
    } catch (error) {
      console.error('Error handling reaction:', error);
    }

    setIsOpen(false);
  };

  // Get the current user's reaction if any
  const userReaction = reactions.find(r => r.userId === user?.id);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`${variant === 'text' ? "text-sm text-muted-foreground hover:text-foreground" : ""} ${userReaction ? reactionEmojis[userReaction.type as ReactionType]?.color : ""}`}
        >
          {variant === 'icon' ? (
            userReaction ? (
              <span className="text-lg">{reactionEmojis[userReaction.type as ReactionType]?.emoji}</span>
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )
          ) : (
            userReaction ? reactionLabels[userReaction.type as ReactionType] : 'Like'
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="p-2 grid grid-cols-6 gap-1 w-60"
        style={{ zIndex: 99999 }} // Ensure it appears above the slider
      >
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