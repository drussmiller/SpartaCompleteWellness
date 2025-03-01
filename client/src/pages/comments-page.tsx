
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { useAuth } from "@/context/auth-context";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api";

export function CommentsPage() {
  const [location, setLocation] = useLocation();
  const postId = location.split('/').pop(); // Extract postId from URL
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch original post and its comments
  const { data: originalPost, isLoading: isLoadingPost } = useQuery<Post & { author?: { username: string; imageUrl?: string; id: number } }>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to load post");
      return res.json();
    },
    enabled: !!postId,
  });

  const { data: comments = [], isLoading: isLoadingComments } = useQuery<(Post & { author?: { username: string; imageUrl?: string; id: number } })[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
    enabled: !!postId,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/posts`, {
        type: "comment",
        content: comment,
        parentId: Number(postId)
      });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      // Invalidate and refetch comments
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) {
      addCommentMutation.mutate();
    }
  };

  const isLoading = isLoadingPost || isLoadingComments;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background p-4 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Comments</h1>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* Original post */}
            {originalPost && (
              <div className="border rounded-lg p-4 mb-4 bg-white">
                <div className="flex items-start">
                  <Avatar className="h-10 w-10 mr-3">
                    {originalPost.author?.imageUrl ? (
                      <AvatarImage src={originalPost.author.imageUrl} alt={originalPost.author.username} />
                    ) : (
                      <AvatarFallback>{originalPost.author?.username.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{originalPost.author?.username}</p>
                    <p className="mt-1">{originalPost.content}</p>
                    {originalPost.imageUrl && (
                      <img
                        src={originalPost.imageUrl}
                        alt="Post"
                        className="mt-2 rounded-lg w-full object-cover max-h-80"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-3">
              <h2 className="font-medium text-gray-500">
                {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
              </h2>
              {comments.map((comment) => (
                <div key={comment.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-start">
                    <Avatar className="h-8 w-8 mr-2">
                      {comment.author?.imageUrl ? (
                        <AvatarImage src={comment.author.imageUrl} alt={comment.author.username} />
                      ) : (
                        <AvatarFallback>{comment.author?.username.charAt(0).toUpperCase()}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{comment.author?.username}</p>
                      <p className="text-sm mt-1">{comment.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t bg-background p-4 pb-safe">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!comment.trim() || addCommentMutation.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export default CommentsPage;
