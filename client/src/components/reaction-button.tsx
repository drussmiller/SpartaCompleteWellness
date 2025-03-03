import { useState } from "react";
import { Heart, ThumbsUp, Smile, Medal, Hand } from "lucide-react";
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

const reactionIcons = {
  like: ThumbsUp,
  heart: Heart,
  smile: Smile,
  celebrate: Medal,
  support: Hand,
} as const;

const reactionLabels = {
  like: "Like",
  heart: "Love",
  smile: "Smile",
  celebrate: "Celebrate",
  support: "Support",
} as const;

type ReactionType = keyof typeof reactionIcons;

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
    if (reaction.type in reactionIcons) {
      acc[reaction.type as ReactionType] = (acc[reaction.type as ReactionType] || 0) + 1;
    }
    return acc;
  }, {} as Record<ReactionType, number>);

  const handleReaction = (type: ReactionType) => {
    const hasReacted = reactions.some((r) => r.type === type);
    if (hasReacted) {
      removeReactionMutation.mutate(type);
    } else {
      addReactionMutation.mutate(type);
    }
    setIsOpen(false);
  };

  const totalReactions = Object.values(reactionCounts).reduce((a, b) => a + b, 0);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="gap-2"
        >
          <ThumbsUp className="h-4 w-4" />
          {totalReactions > 0 && <span>{totalReactions}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(reactionIcons) as ReactionType[]).map((type) => {
          const Icon = reactionIcons[type];
          const count = reactionCounts[type] || 0;
          const hasReacted = reactions.some((r) => r.type === type);

          return (
            <DropdownMenuItem
              key={type}
              onClick={() => handleReaction(type)}
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                hasReacted && "bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{reactionLabels[type]}</span>
              {count > 0 && (
                <span className="ml-auto text-muted-foreground">{count}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}