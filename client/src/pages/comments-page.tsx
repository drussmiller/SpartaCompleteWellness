import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { AppLayout } from "@/components/app-layout";

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  console.log("=== CommentsPage Debug ===");
  console.log("Current postId:", postId);
  console.log("Current user:", currentUser?.id);

  useEffect(() => {
    console.log("Component mounted with postId:", postId);
  }, []);

  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    queryFn: async () => {
      console.log("Fetching original post with ID:", postId);
      const res = await apiRequest("GET", `/api/posts/${postId}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch post:", errorText);
        throw new Error(`Failed to fetch post: ${errorText}`);
      }

      const data = await res.json();
      console.log("Received post data:", data);
      return data;
    },
    enabled: Boolean(postId),
  });

  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError, refetch } = useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: async () => {
      console.log("Fetching comments for post:", postId);
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to fetch comments:", errorText);
        throw new Error(`Failed to fetch comments: ${errorText}`);
      }

      const data = await res.json();
      console.log("Received comments data:", data);
      return data;
    },
    enabled: Boolean(postId),
  });

  console.log("=== Current State ===");
  console.log("Loading states:", { isPostLoading, areCommentsLoading });
  console.log("Errors:", { postError, commentsError });
  console.log("Data:", { originalPost, commentsCount: comments?.length });

  if (!currentUser) {
    console.log("No user logged in");
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <p>Please log in to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isPostLoading || areCommentsLoading) {
    console.log("Loading state active");
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (postError || commentsError) {
    console.error("Rendering error state:", postError || commentsError);
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center text-destructive">
          <p>{postError?.message || commentsError?.message}</p>
        </div>
      </AppLayout>
    );
  }

  if (!originalPost) {
    console.log("No post found");
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  console.log("Rendering main comments view");
  return (
    <AppLayout title="Comments">
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        <main className="flex-1 p-4 pb-32">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="border rounded-lg p-4 bg-background">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={originalPost.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author?.username}`} 
                  />
                  <AvatarFallback>{originalPost.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{originalPost.author?.username}</div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(originalPost.createdAt).toLocaleString()}
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

            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="border rounded-lg p-4 bg-background">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage 
                        src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`} 
                      />
                      <AvatarFallback>{comment.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{comment.author?.username}</div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(comment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <div className="bg-background rounded-lg p-6">
                  <p className="text-center text-muted-foreground py-6">
                    No comments yet. Be the first to comment!
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        <div className="fixed bottom-16 md:bottom-0 left-0 md:left-16 right-0 bg-background border-t border-border p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col gap-2">
              <Textarea
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    if (comment.trim()) {
                      createCommentMutation.mutate();
                    }
                  }
                }}
                placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
                className="resize-none"
                rows={2}
              />
              {replyTo && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Replying to comment #{replyTo}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyTo(null)}
                  >
                    Cancel Reply
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}