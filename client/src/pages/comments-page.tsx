import React, { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { useAuth } from "@/context/auth-context";
import { ArrowLeft, Send } from "lucide-react";

const CommentsPage: React.FC = () => {
  const [location, params] = useLocation(); // useLocation and useParams from wouter
  const { postId } = params as { postId: string };
  const navigate = () => {}; // Placeholder for useNavigate. wouter doesn't directly offer this. We'll need to find alternative
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

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: comment,
        parentId: Number(postId),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to add comment" }));
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      toast({ description: "Comment added" });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", description: error.message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutateAsync();
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background p-4 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)} //This will likely need adjustment based on wouter's navigation
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Comments</h1>
      </header>

      <main className="flex-1 overflow-auto p-4 pb-28">
        {originalPost && (
          <div className="mb-6">
            <div className="mb-6 p-4 border rounded-lg bg-white">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={originalPost.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author?.username}`} />
                  <AvatarFallback>{originalPost.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{originalPost.author?.username}</div>
                    <p className="text-xs text-muted-foreground">
                      {originalPost.createdAt && new Date(originalPost.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                    {originalPost.content}
                  </p>
                  {originalPost.imageUrl && (
                    <img
                      src={originalPost.imageUrl}
                      alt="Post"
                      className="mt-2 rounded-md max-h-[300px] w-auto"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoadingComments || isLoadingPost ? (
          <div className="text-center py-8">Loading...</div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="p-4 border rounded-lg bg-white">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`} />
                    <AvatarFallback>{comment.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{comment.author?.username}</div>
                      <p className="text-xs text-muted-foreground">
                        {comment.createdAt && new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

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
};

export default CommentsPage;