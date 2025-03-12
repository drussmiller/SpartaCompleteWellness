
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Reaction } from '@/lib/types';

interface ReactionSummaryProps {
  postId: number;
}

export function ReactionSummary({ postId }: ReactionSummaryProps) {
  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 30000,
  });

  // Count total reactions
  const totalReactions = reactions.length;
  
  // Get unique reaction types
  const uniqueReactionTypes = [...new Set(reactions.map(r => r.type))];

  const getEmojiForType = (type: string): string => {
    const allEmojis: Record<string, { emoji: string, color: string }> = {
      like: { emoji: "👍", color: "text-blue-500" },
      love: { emoji: "❤️", color: "text-red-500" },
      laugh: { emoji: "😂", color: "text-yellow-500" },
      wow: { emoji: "😮", color: "text-yellow-500" },
      sad: { emoji: "😢", color: "text-blue-500" },
      angry: { emoji: "😡", color: "text-red-500" },
      fire: { emoji: "🔥", color: "text-orange-500" },
      pray: { emoji: "🙏", color: "text-amber-500" },
      muscle: { emoji: "💪", color: "text-blue-500" },
      thumbs_down: { emoji: "👎", color: "text-slate-500" },
    };

    return allEmojis[type]?.emoji || "👍";
  };

  // Sort unique reactions (can sort by frequency if you have that data)
  const sortedUniqueReactions = uniqueReactionTypes.slice(0, 5);

  if (reactions.length === 0) return null;

  // Get unique emoji reactions
  const uniqueEmojis = sortedUniqueReactions.map(type => getEmojiForType(type));

  return (
    <div className="flex items-center justify-between text-sm h-full">
      <TooltipProvider>
        <div className="flex flex-wrap gap-0 items-center h-full">
          {uniqueEmojis.map((emoji, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <span className="text-base -mr-0.5">{emoji}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{sortedUniqueReactions[index]?.replace('_', ' ')}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      <div className="text-xs text-muted-foreground ml-2">{totalReactions}</div>
    </div>
  );
}
