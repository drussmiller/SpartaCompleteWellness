import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import type { Reaction } from "@shared/schema";

interface ReactionSummaryProps {
  postId: number;
}

export function ReactionSummary({ postId }: ReactionSummaryProps) {
  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 30000,
  });

  const reactionCounts: Record<string, number> = {};
  reactions.forEach(reaction => {
    if (reaction.type) {
      reactionCounts[reaction.type] = (reactionCounts[reaction.type] || 0) + 1;
    }
  });

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

  const sortedReactions = Object.entries(reactionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedReactions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      <TooltipProvider>
        <div className="flex flex-wrap gap-1">
          {sortedReactions.map(([type, count]) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <div className="flex items-center bg-muted rounded-full px-2 py-0.5">
                  <span>{getEmojiForType(type)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{count}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{type.replace('_', ' ')}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
