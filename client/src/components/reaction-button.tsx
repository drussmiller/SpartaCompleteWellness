import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  weight: "Weight",
  angel: "Angel",
  dove: "Dove",
  church: "Church",
  bible: "Bible",
  cross: "Cross",
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
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: reactions = [] } = useQuery({
    queryKey: [`/api/posts/${postId}/reactions`],
    staleTime: 60000, // 60 seconds
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: true,
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
    const existingReaction = reactions.find((r: Reaction) => r.userId === user.id && r.type === type);

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
  const userReaction = reactions.find((r: Reaction) => r.userId === user?.id);

  // Only include the specified reaction types
  const allReactions: ReactionType[] = [
    'like', 'love', 'laugh', 'wow', 'sad', 
    'angry', 'fire', 'pray', 'muscle', 'thumbs_down'
  ];

  return (
    <div className="relative" data-reaction-button>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="lg"
        className={`${variant === 'text' ? "text-sm text-muted-foreground hover:text-foreground" : ""} ${userReaction ? "text-blue-500" : "text-black"} p-0 h-6`}
        onTouchStart={(e) => {
          touchStartTimeRef.current = Date.now();
          longPressTimerRef.current = setTimeout(() => {
            setIsOpen(true);
          }, 500);
        }}
        onTouchEnd={(e) => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          
          const touchDuration = Date.now() - touchStartTimeRef.current;
          // If it was a quick tap (under 500ms), handle the like reaction
          if (touchDuration < 500) {
            e.stopPropagation();
            handleReaction('like');
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen(true);
        }}
        onClick={(e) => {
          e.stopPropagation();
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
      {isOpen && createPortal(
        <div 
          className="fixed w-84 grid grid-cols-5 p-2 gap-1 bg-white dark:bg-slate-950 border rounded-md shadow-lg"
          style={{ 
            zIndex: 50000,
            top: 'var(--menu-top)',
            left: 'var(--menu-left)'
          }}
          ref={(el) => {
            if (el && typeof window !== 'undefined') {
              const rect = document.querySelector('[data-reaction-button]')?.getBoundingClientRect();
              if (rect) {
                el.style.setProperty('--menu-top', `${rect.top - rect.height - 10}px`);
                el.style.setProperty('--menu-left', `${rect.left}px`);
              }
            }
          }}
        >
          {allReactions.map((type) => {
            const isActive = reactions.some((r: Reaction) => r.userId === user?.id && r.type === type);
            return (
              <button
                key={type}
                className={`flex flex-col items-center justify-center h-12 w-12 rounded hover:bg-muted ${isActive ? reactionEmojis[type]?.color || "" : ""}`}
                onClick={() => {
                  handleReaction(type);
                  setIsOpen(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="text-lg">{reactionEmojis[type]?.emoji}</span>
                <span className="text-xs capitalize">{reactionLabels[type] || type.replace('_', ' ')}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}