import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SmilePlus } from "lucide-react";
import { Post } from "@shared/schema";

interface ReactionButtonProps {
  post: Post & {
    author?: {
      id: number;
      username: string;
      imageUrl?: string;
    };
  };
}

export function ReactionButton({ post }: ReactionButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const addReactionMutation = useMutation({
    mutationFn: async ({ emoji }: { emoji: string }) => {
      const res = await apiRequest("POST", `/api/posts/${post.id}/reactions`, {
        type: emoji
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add reaction");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setIsPickerOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to add reaction"
      });
    }
  });

  if (!user) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setIsPickerOpen(!isPickerOpen)}
      >
        <SmilePlus className="h-4 w-4 mr-1" />
        React
      </Button>
    </div>
  );
}
