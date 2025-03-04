import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Trash2, MessageCircle, ChevronLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { type CommentWithAuthor } from "@shared/schema";
import { AppLayout } from "@/components/app-layout";

function CommentThread({
  comment,
  depth = 0,
  onReply,
  onRefresh
}: {
  comment: CommentWithAuthor & { replies?: Array<CommentWithAuthor> };
  depth?: number;
  onReply: (parentId: number) => void;
  onRefresh: () => void;
}) {
  const maxDepth = 3; // Maximum nesting level
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content || "");

  // Handle delete
  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${comment.id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete comment" }));
        throw new Error(error.message || "Failed to delete comment");
      }
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

  return (
    <div className={`relative ${depth > 0 ? 'ml-4 md:ml-8 pl-4 border-l border-border' : ''}`}>
      <div
        className={`
          flex items-start gap-3 p-3 rounded-lg border 
          ${depth > 0 ? 'bg-muted/30' : 'bg-background'}
          cursor-pointer relative
        `}
        onClick={() => setShowActions(!showActions)}
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={comment.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{comment.author.username}</div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(comment.createdAt!).toLocaleString()}
            </div>
          </div>
          {isEditing ? (
            <div>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="text-sm mt-1"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditText(comment.content || "");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    if (!editText.trim()) return;
                    try {
                      const res = await apiRequest("PATCH", `/api/posts/${comment.id}`, {
                        content: editText.trim()
                      });
                      if (!res.ok) throw new Error("Failed to update comment");
                      setIsEditing(false);
                      onRefresh();
                      toast({ description: "Comment updated successfully" });
                    } catch (error) {
                      toast({
                        variant: "destructive",
                        description: "Failed to update comment"
                      });
                    }
                  }}
                >
                  Update
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words comment-body mt-1">{comment.content}</p>
          )}
        </div>

        {showActions && (
          <div className="absolute right-0 top-full mt-2 z-10 bg-background rounded-lg shadow-lg border border-border overflow-hidden">
            {depth < maxDepth && (
              <Button
                variant="ghost"
                className="w-full justify-start px-4 py-2 text-left"
                onClick={() => {
                  onReply(comment.id);
                  setShowActions(false);
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Reply
              </Button>
            )}
            {currentUser?.id === comment.author.id && (
              <>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-2 text-left"
                  onClick={() => {
                    setIsEditing(true);
                    setShowActions(false);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-4 py-2 text-left text-destructive"
                  onClick={() => deleteCommentMutation.mutate()}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && depth < maxDepth && (
        <div className="mt-2 space-y-2">
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
        depth: newDepth,
        points: 1
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

  if (isPostLoading || areCommentsLoading) {
    return (
      <AppLayout title="Comments">
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Comments">
      <main className="p-4 pb-24 lg:pb-4 max-w-2xl mx-auto">
        {originalPost && (
          <div className="mb-6">
            <div className="p-4 border rounded-lg">
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
          </div>
        )}

        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              onReply={setReplyTo}
              onRefresh={refetch}
            />
          ))}
          {comments.length === 0 && (
            <div className="bg-background rounded-lg p-6 shadow-sm">
              <p className="text-center text-muted-foreground py-6">
                No comments yet. Be the first to comment!
              </p>
            </div>
          )}
        </div>

        {/* Comment input section */}
        <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-16 right-0 bg-background border-t border-border p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col gap-2">
              <Textarea
                ref={commentInputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    createCommentMutation.mutate();
                  }
                }}
                placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
                className="resize-none"
                rows={2}
              />
              {replyTo && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Replying to comment #{replyTo}
                  </span>
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
      </main>
    </AppLayout>
  );
}