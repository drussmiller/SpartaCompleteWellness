import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDisplayName, getDisplayInitial } from "@/lib/utils";
import type { ReactionWithUser } from "@shared/schema";

interface ReactionSummaryProps {
  postId: number;
}

const reactionEmojiMap: Record<string, { emoji: string; color: string; label: string }> = {
  like: { emoji: "👍", color: "text-blue-500", label: "Like" },
  love: { emoji: "❤️", color: "text-red-500", label: "Love" },
  laugh: { emoji: "😂", color: "text-yellow-500", label: "Laugh" },
  wow: { emoji: "😮", color: "text-yellow-500", label: "Wow" },
  sad: { emoji: "😢", color: "text-blue-500", label: "Sad" },
  angry: { emoji: "😡", color: "text-red-500", label: "Angry" },
  fire: { emoji: "🔥", color: "text-orange-500", label: "Fire" },
  pray: { emoji: "🙏", color: "text-amber-500", label: "Pray" },
  muscle: { emoji: "💪", color: "text-blue-500", label: "Strength" },
  thumbs_down: { emoji: "👎", color: "text-slate-500", label: "Dislike" },
  heart: { emoji: "❤️", color: "text-red-500", label: "Heart" },
  smile: { emoji: "😊", color: "text-yellow-500", label: "Smile" },
  celebrate: { emoji: "🎉", color: "text-purple-500", label: "Celebrate" },
  support: { emoji: "🤝", color: "text-green-500", label: "Support" },
  angel: { emoji: "😇", color: "text-sky-500", label: "Angel" },
  dove: { emoji: "🕊️", color: "text-sky-500", label: "Dove" },
  church: { emoji: "⛪", color: "text-slate-500", label: "Church" },
  bible: { emoji: "📖", color: "text-amber-500", label: "Bible" },
  cross: { emoji: "✝️", color: "text-red-500", label: "Cross" },
  faith: { emoji: "🙌", color: "text-amber-500", label: "Faith" },
};

const getReactionMeta = (type: string) =>
  reactionEmojiMap[type] || { emoji: "👍", color: "text-blue-500", label: type.replace("_", " ") };

export function ReactionSummary({ postId }: ReactionSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  const { data: reactions = [] } = useQuery<ReactionWithUser[]>({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 30000,
  });

  const totalReactions = reactions.length;

  // Group by type for tab counts
  const grouped: Record<string, ReactionWithUser[]> = {};
  for (const r of reactions) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  // Order reaction tabs by count desc
  const sortedTypes = Object.keys(grouped).sort(
    (a, b) => grouped[b].length - grouped[a].length,
  );

  // Show up to 3 unique emojis in summary
  const uniqueEmojis = Array.from(
    new Set(sortedTypes.slice(0, 3).map((t) => getReactionMeta(t).emoji)),
  );

  const openPopup = () => {
    if (totalReactions === 0) return;
    setActiveTab("all");
    setIsOpen(true);
  };

  const startLongPress = () => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openPopup();
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  if (totalReactions === 0) return null;

  const renderUserList = (list: ReactionWithUser[]) => (
    <ScrollArea className="max-h-[60vh] pr-2">
      <ul className="flex flex-col gap-2 py-1">
        {list.map((r) => {
          const meta = getReactionMeta(r.type);
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 py-1"
              data-testid={`row-reaction-user-${r.userId}`}
            >
              <div className="relative">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={r.imageUrl || undefined} alt={getDisplayName(r)} />
                  <AvatarFallback>{getDisplayInitial(r)}</AvatarFallback>
                </Avatar>
                <span
                  className="absolute -bottom-1 -right-1 text-sm leading-none bg-background rounded-full"
                  aria-label={meta.label}
                >
                  {meta.emoji}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{getDisplayName(r)}</span>
                <span className="text-xs text-muted-foreground">{meta.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );

  return (
    <>
      <button
        type="button"
        className="flex items-center justify-between text-sm h-full select-none cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          openPopup();
        }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          openPopup();
        }}
        data-testid={`button-reaction-summary-${postId}`}
        aria-label="View who reacted"
      >
        <div className="flex flex-wrap gap-0 items-center h-full">
          {uniqueEmojis.map((emoji, index) => (
            <span key={index} className="text-base -mr-0.5">
              {emoji}
            </span>
          ))}
        </div>
        <div className="text-xs text-muted-foreground ml-2">{totalReactions}</div>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="sm:max-w-md"
          data-testid={`dialog-reactions-${postId}`}
        >
          <DialogHeader>
            <DialogTitle>Reactions</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="all" data-testid="tab-reactions-all">
                All {totalReactions}
              </TabsTrigger>
              {sortedTypes.map((type) => {
                const meta = getReactionMeta(type);
                return (
                  <TabsTrigger
                    key={type}
                    value={type}
                    data-testid={`tab-reactions-${type}`}
                  >
                    <span className="mr-1">{meta.emoji}</span>
                    {grouped[type].length}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <TabsContent value="all" className="mt-3">
              {renderUserList(reactions)}
            </TabsContent>
            {sortedTypes.map((type) => (
              <TabsContent key={type} value={type} className="mt-3">
                {renderUserList(grouped[type])}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
