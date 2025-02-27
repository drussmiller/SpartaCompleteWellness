import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BottomNav } from "@/components/bottom-nav";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Trash2, MessageCircle, ChevronLeft } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { type CommentWithAuthor } from "@shared/schema";

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
  const [editText, setEditText] = useState(comment.content);

  // Deletion mutation remains unchanged
  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/comments/${comment.id}`);
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

  const handleDeleteClick = async () => {
    try {
      await deleteCommentMutation.mutateAsync();
      setShowActions(false);
    } catch (error) {
      // Error is handled in onError
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setShowActions(false); // Close the drawer when edit is clicked
    // Focus the edit text area in the next render cycle
    setTimeout(() => {
      const textareas = document.querySelectorAll('textarea');
      const editTextarea = Array.from(textareas).find(
        textarea => textarea.value === editText
      );
      if (editTextarea) {
        editTextarea.focus();
      }
    }, 50);
  };

  const handleEditSave = async () => {
    if (!editText.trim()) {
      return;
    }

    try {
      const res = await apiRequest("PATCH", `/api/comments/${comment.id}`, {
        content: editText.trim()
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update comment");
      }

      setIsEditing(false);
      setShowActions(false); // Hide the drawer after saving edits
      toast({ description: "Comment updated successfully" });
      onRefresh(); // Refresh the comment list
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Failed to update comment"
      });
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setShowActions(false); // Hide the drawer when canceling edits
    setEditText(comment.content);
  };


  return (
    <div className={`relative ${depth > 0 ? 'ml-4 md:ml-8 pl-4 border-l border-border' : ''}`}>
      <div 
        className={`
          flex items-start gap-3 p-3 rounded-lg border 
          ${depth > 0 ? 'bg-muted/30' : 'bg-background'}
          cursor-pointer relative
        `}
        onClick={() => {
          // Cancel any active reply when opening comment actions
          if (onReply) {
            onReply(null);
          }
          setShowActions(!showActions);
        }}
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
                  onClick={handleEditCancel}
                >
                  Cancel
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleEditSave}
                >
                  Update
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words comment-body mt-1">{comment.content}</p>
          )}

        </div>

        {/* Action Drawer */}
        {showActions && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            onClick={() => setShowActions(false)}
          >
            <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
            <div 
              className="fixed bottom-0 z-50 w-full max-w-md rounded-t-lg bg-background p-0 shadow-lg sm:rounded-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col">
                {depth < maxDepth && (
                  <button
                    className="w-full p-4 text-primary font-semibold flex justify-center border-b hover:bg-muted text-2xl"
                    onClick={() => {
                      onReply(comment.id);
                      setShowActions(false);
                    }}
                  >
                    Reply
                  </button>
                )}
                {currentUser?.id === comment.author.id && (
                  <>
                    <button
                      className="w-full p-4 text-blue-600 font-semibold flex justify-center border-b hover:bg-muted text-2xl"
                      onClick={handleEditClick}
                    >
                      Edit
                    </button>
                    <button
                      className="w-full p-4 text-destructive font-semibold flex justify-center hover:bg-muted text-2xl"
                      onClick={handleDeleteClick}
                    >
                      Delete
                    </button>
                  </>
                )}

                <button
                  className="w-full p-4 text-foreground font-semibold flex justify-center border-t hover:bg-muted text-2xl"
                  onClick={() => {
                    navigator.clipboard.writeText(comment.content);
                    setShowActions(false);
                    toast({ description: "Comment copied to clipboard" });
                  }}
                >
                  Copy
                </button>

                <button
                  className="w-full p-4 bg-gray-400 hover:bg-gray-500 text-black font-bold flex justify-center border-t text-2xl"
                  onClick={() => setShowActions(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Render nested replies */}
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
        imageUrl: null, // Add the required imageUrl field
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
    // Focus on the textarea after a short delay to ensure state is updated
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
      }
    }, 50);
  };

  // Effect to focus the input when the page loads and when replyTo changes
  useEffect(() => {
    // Set focus to the comment input whenever replyTo changes or when the page opens
    const timer = setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
      }
    }, 300); // Increased timeout for better reliability

    return () => clearTimeout(timer);
  }, [replyTo]);

  // Additional effect to focus when the component mounts
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
      }
    }, 500);

    return () => clearTimeout(focusTimer);
  }, []);

  const handleSubmitComment = async () => {
    if (!comment.trim()) return;

    try {
      await createCommentMutation.mutateAsync();
    } catch (error) {
      // Error handling is already done in the mutation
    }
  };

  if (isPostLoading || areCommentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="p-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            className="mr-2"
          >
            <ChevronLeft className="h-4 w-4" /> {/* Changed to ChevronLeft */}
          </Button>
          <h1 className="text-xl font-bold truncate">Comments</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 pb-28">
        {originalPost && (
          <div className="mb-6">
            {/* Assuming PostCard component exists */}
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
          </div>
        )}

        <div className="space-y-1">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              onReply={handleReply}
              onRefresh={refetch}
            />
          ))}
          {comments.length === 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <p className="text-center text-muted-foreground py-6">
                No comments yet. Be the first to comment!
              </p>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg"> {/* Fixed position comment input that overlays the nav */}
        <div className="flex flex-col w-full">
          <Textarea
            ref={commentInputRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' && !e.shiftKey) && !e.ctrlKey) {
                e.preventDefault();
                handleSubmitComment();
              }
            }}
            placeholder={replyTo ? "Enter reply..." : "Enter comment..."}
            className="resize-none w-full border-0 rounded-none px-4 pt-3 text-base min-h-[50px] overflow-hidden whitespace-nowrap text-ellipsis focus:whitespace-normal"
          />
          {replyTo && (
            <div className="mt-2 mb-1 flex justify-between items-center text-xs text-muted-foreground px-2">
              <span className="ml-2">
                Replying to {comments.find(c => c.id === replyTo)?.author?.username || `comment #${replyTo}`}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-auto py-1 px-3 text-sm mr-2"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="pb-20">
        <BottomNav />
      </div>
    </div>
  );
}