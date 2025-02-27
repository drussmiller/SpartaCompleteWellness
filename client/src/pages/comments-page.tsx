import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BottomNav } from "@/components/bottom-nav";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { type CommentWithAuthor } from "@shared/schema";

function CommentThread({
  comment,
  depth = 0,
  onReply,
  onRefresh
}: {
  comment: CommentWithAuthor;
  depth?: number;
  onReply: (parentId: number) => void;
  onRefresh: () => void;
}) {
  const maxDepth = 3;
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { postId } = useParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Simpler deletion mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/comments/${comment.id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete comment" }));
        throw new Error(error.message || "Failed to delete comment");
      }
    },
    onMutate: () => {
      setDrawerOpen(false); // Close drawer immediately
    },
    onSuccess: () => {
      toast({ description: "Comment deleted successfully" });
      onRefresh(); // Refresh the comment list
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment"
      });
    }
  });

  const handleDeleteClick = async () => {
    try {
      await deleteCommentMutation.mutateAsync();
    } catch (error) {
      // Error is already handled in onError
    }
  };

  return (
    <div className={`pl-${depth > 0 ? 4 : 0}`}>
      <div 
        className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setDrawerOpen(true)}
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="font-medium">{comment.author.username}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(comment.createdAt!).toLocaleString()}
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerTrigger asChild>
          <div className="hidden" />
        </DrawerTrigger>
        <DrawerContent className="p-0">
          <div className="flex flex-col divide-y divide-border">
            <Button 
              variant="ghost" 
              className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
              onClick={() => {
                onReply(comment.id);
                setDrawerOpen(false);
              }}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Reply
            </Button>
            {(currentUser?.id === comment.author.id || currentUser?.isAdmin) && (
              <Button 
                variant="ghost" 
                className="justify-center rounded-none py-6 text-red-500 text-base font-normal"
                onClick={handleDeleteClick}
                disabled={deleteCommentMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteCommentMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            )}
            <Button
              variant="ghost"
              className="justify-center rounded-none py-6 text-base font-normal"
              onClick={() => {
                navigator.clipboard.writeText(comment.content || '');
                toast({ description: "Comment copied to clipboard" });
                setDrawerOpen(false);
              }}
            >
              Copy
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {comment.replies && comment.replies.length > 0 && depth < maxDepth && (
        <div className="ml-8 mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { postId } = useParams();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: originalPost, isLoading: isPostLoading } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    enabled: !!postId,
  });

  const { data: comments = [], isLoading: areCommentsLoading, refetch } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!postId
  });

  const createCommentMutation = useMutation({
    mutationFn: async () => {
      const parentComment = replyTo ? comments.find(c => c.id === replyTo) : null;
      const newDepth = parentComment ? (parentComment.depth || 0) + 1 : 0;

      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: comment.trim(),
        parentId: replyTo || parseInt(postId!),
        depth: newDepth
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to post comment");
      }
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      setReplyTo(null);
      refetch();
      toast({
        description: "Comment posted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment",
      });
    },
  });

  const handleReply = (parentId: number) => {
    setReplyTo(parentId);
    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleSubmitComment = () => {
    if (!comment.trim()) return;
    createCommentMutation.mutate();
  };

  if (isPostLoading || areCommentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            className="mr-2"
          >
            &larr;
          </Button>
          <h1 className="text-xl font-bold truncate">Comments</h1>
        </div>
      </header>

      <main className="p-4">
        {originalPost && (
          <div className="mb-6 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={originalPost.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author?.username}`} />
                <AvatarFallback>{originalPost.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{originalPost.author?.username}</div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(originalPost.createdAt!).toLocaleString()}
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
        )}

        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onRefresh={refetch}
            />
          ))}
          {comments.length === 0 && (
            <p className="text-center text-muted-foreground py-6">
              No comments yet. Be the first to comment!
            </p>
          )}
        </div>

        <div className="sticky bottom-20 z-10 bg-background pt-2">
          <div className="flex flex-col mb-2">
            <Textarea
              ref={commentInputRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
              placeholder={replyTo ? "Write your reply..." : "Write a comment..."}
              className="resize-none"
            />
            {replyTo && (
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  Replying to comment #{replyTo}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto py-0 px-1"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}