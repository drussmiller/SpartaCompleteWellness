
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
import type { Reaction } from "@shared/schema";

const reactionEmojis = {
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
} as const;

type ReactionType = keyof typeof reactionEmojis;

interface ReactionButtonProps {
  postId: number;
}

export function ReactionButton({ postId }: ReactionButtonProps) {
  const { toast } = useToast();
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

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="gap-2"
        >
          {mostCommonReaction ? (
            <span className="text-lg">{reactionEmojis[mostCommonReaction].emoji}</span>
          ) : (
            <ThumbsUp className="h-4 w-4" />
          )}
          {totalReactions > 0 && <span>{totalReactions}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid grid-cols-4 gap-1 p-2 min-w-[220px]">
        {(Object.keys(reactionEmojis) as ReactionType[]).map((type) => {
          const { emoji } = reactionEmojis[type];
          const count = reactionCounts[type] || 0;
          const hasReacted = reactions.some(
            (r) => r.type === type && r.userId === Number(localStorage.getItem('userId'))
          );
          
          return (
            <DropdownMenuItem
              key={type}
              onClick={() => handleReaction(type)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted p-2 rounded-md",
                hasReacted && "bg-muted"
              )}
            >
              <span className="text-xl">{emoji}</span>
              <span className="text-xs text-center">{reactionLabels[type]}</span>
              {count > 0 && (
                <span className="text-xs text-muted-foreground">{count}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
