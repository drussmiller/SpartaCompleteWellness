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

  const { data: reactions = [], isLoading } = useQuery({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 60000, // 60 seconds
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: "if-stale",
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/${postId}/reactions`);
        return res.json();
      } catch (error) {
        console.error("Error fetching reactions:", error);
        return []; // Return an empty array on error
      }
    },
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

  const handleReaction = async (type: ReactionType = 'like') => {
    if (!user?.id) {
      toast({
        title: "Authentication required",
        description: "Please sign in to react to posts",
        variant: "destructive",
      });
      return;
    }

    // Find user's existing reaction of this type
    const existingReaction = reactions.find(r => r.userId === user.id && r.type === type);

    try {
      if (existingReaction) {
        // If already reacted with this type, remove it
        await removeReactionMutation.mutateAsync(type);
      } else {
        // Not reacted yet with this type, add it
        await addReactionMutation.mutateAsync(type);
      }
    } catch (error) {
      console.error('Error handling reaction:', error);
    }
  };

  // Get the current user's reaction if any
  const userReaction = reactions.find(r => r.userId === user?.id);

  // Only include the specified reaction types
  const allReactions: ReactionType[] = [
    'like', 'love', 'laugh', 'wow', 'sad', 
    'angry', 'fire', 'pray', 'muscle', 'thumbs_down'
  ];

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => {
      // Only allow opening via right-click
      if (!open) {
        setIsOpen(false);
      }
    }} modal={true}>
      <DropdownMenuTrigger asChild onContextMenu={(e) => {
        e.preventDefault();
        setIsOpen(true);
      }}>
        <Button
          variant="ghost"
          size="lg"  /* Increased button size */
          className={`${variant === 'text' ? "text-sm text-muted-foreground hover:text-foreground" : ""} ${userReaction ? "text-blue-500" : "text-black"} p-0 h-6`}
          onClick={(e) => {
            e.preventDefault(); // Prevent default action
            e.stopPropagation(); // Prevent event bubbling

            // Prevent dropdown from opening
            setIsOpen(false);

            // Handle the like reaction directly
            handleReaction('like');
          }}
        >
          {variant === 'icon' ? (
            <div className="flex items-center gap-1">
              <ThumbsUp className={`h-4 w-4 ${userReaction ? reactionEmojis[userReaction.type as ReactionType]?.color || "text-blue-500" : "text-black"}`} />
              <span>Like</span>
            </div>
          ) : (
            <span>Like</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-84 grid grid-cols-5 p-2 gap-1" side="top" sideOffset={5} style={{ zIndex: 9999 }}>
        {allReactions.map((type) => {
          const isActive = reactions.some(r => r.userId === user?.id && r.type === type);
          return (
            <DropdownMenuItem
              key={type}
              className={`flex flex-col items-center justify-center h-12 w-12 rounded hover:bg-muted ${isActive ? reactionEmojis[type]?.color || "" : ""}`}
              onClick={() => handleReaction(type)}
            >
              <span className="text-lg">{reactionEmojis[type]?.emoji}</span>
              <span className="text-xs capitalize">{reactionLabels[type] || type.replace('_', ' ')}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}