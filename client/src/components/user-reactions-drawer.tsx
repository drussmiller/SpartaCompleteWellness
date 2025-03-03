
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Reaction, User } from "@shared/schema";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserReactionsDrawerProps {
  postId: number;
  reactionType: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserReactionsDrawer({ 
  postId, 
  reactionType, 
  isOpen, 
  onClose 
}: UserReactionsDrawerProps) {
  const { data: reactions = [] } = useQuery<(Reaction & { user: User })[]>({
    queryKey: [`/api/posts/${postId}/reactions/users`, reactionType],
    queryFn: async () => {
      if (!reactionType) return [];
      try {
        const res = await apiRequest(
          "GET", 
          `/api/posts/${postId}/reactions/users?type=${encodeURIComponent(reactionType)}`
        );
        if (!res.ok) throw new Error("Failed to fetch reactions");
        return res.json();
      } catch (error) {
        console.error("Error fetching user reactions:", error);
        return [];
      }
    },
    enabled: isOpen && !!reactionType,
  });

  const getEmojiLabel = (type: string) => {
    // This converts snake_case to Title Case
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="flex justify-between items-center">
          <div>
            <DrawerTitle className="flex items-center gap-2">
              People who reacted with {reactionType && getEmojiLabel(reactionType)}
            </DrawerTitle>
            <DrawerDescription>
              {reactions.length} {reactions.length === 1 ? 'person' : 'people'}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="px-4 pb-6 pt-2 overflow-y-auto max-h-[calc(80vh-100px)]">
          {reactions.length > 0 ? (
            <div className="space-y-4">
              {reactions.map((reaction) => (
                <div key={reaction.userId} className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage 
                      src={reaction.user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${reaction.user?.username}`} 
                    />
                    <AvatarFallback>
                      {reaction.user?.username?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{reaction.user?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {reaction.user?.preferredName || ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No users found with this reaction
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
