import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { MoreVertical, Edit, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function PostOptionsMenu({ 
  postId, 
  onDelete 
}: { 
  postId: number;
  onDelete?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showOptions, setShowOptions] = useState(false);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to delete post");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({ description: "Post deleted successfully" });
      if (onDelete) onDelete();
      setShowOptions(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete post"
      });
    }
  });

  if (!user) return null;

  return (
    <div className="relative mr-2">
      <button 
        onClick={(e) => {
          e.stopPropagation();
          setShowOptions(!showOptions);
        }}
        className="p-1 rounded-full hover:bg-gray-100"
      >
        <MoreVertical className="h-5 w-5 text-gray-500" />
      </button>

      {showOptions && (
        <div className="absolute right-0 top-8 w-36 bg-white shadow-lg rounded-md overflow-hidden z-10 border border-gray-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Handle edit
              setShowOptions(false);
            }}
            className="flex items-center w-full px-3 py-2 text-sm hover:bg-gray-100"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              deletePostMutation.mutate();
            }}
            className="flex items-center w-full px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            <Trash className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}