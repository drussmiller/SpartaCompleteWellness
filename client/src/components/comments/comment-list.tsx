import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { CommentForm } from "./comment-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CommentActionsDrawer } from "./comment-actions-drawer";
import { useAuth } from "@/hooks/use-auth";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;
}

type CommentWithReplies = Post & {
  author: User;
  replies?: CommentWithReplies[];
};

export function CommentList({ comments: initialComments, postId }: CommentListProps) {
  const [comments, setComments] = useState(initialComments);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [selectedComment, setSelectedComment] = useState<number | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null); // Added ref for edit form

  // Find the comment we're replying to
  const replyingToComment = comments.find(c => c.id === replyingTo);

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!replyingTo) throw new Error("No comment selected to reply to");
      if (!user?.id) throw new Error("You must be logged in to reply");

      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: content.trim(),
        parentId: replyingTo,
        depth: (replyingToComment?.depth ?? 0) + 1
      });

      if (!res.ok) {
        throw new Error("Failed to post reply");
      }

      return res.json();
    },
    onSuccess: (newReply) => {
      // Find the parent comment and add the reply to its replies array
      const updatedComments = comments.map(comment => {
        if (comment.id === replyingTo) {
          return {
            ...comment,
            replies: [
              ...(comment.replies || []),
              { ...newReply, author: user }
            ]
          };
        }
        return comment;
      });

      setComments(updatedComments);
      queryClient.setQueryData(["/api/posts/comments", postId], updatedComments);
      setReplyingTo(null);
      toast({
        description: "Reply added successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Reply mutation error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to post reply",
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      if (!content.trim()) {
        throw new Error("Comment content cannot be empty");
      }

      const res = await apiRequest("PATCH", `/api/posts/${id}`, {
        content: content.trim()
      });

      if (!res.ok) {
        throw new Error("Failed to update comment");
      }

      return res.json();
    },
    onSuccess: (updatedComment) => {
      // Update comments recursively including nested replies
      const updateCommentsRecursively = (commentsList: (Post & { author: User; replies?: (Post & { author: User })[] })[]) => {
        return commentsList.map(comment => {
          if (comment.id === updatedComment.id) {
            return { ...comment, ...updatedComment };
          }
          if (comment.replies) {
            return {
              ...comment,
              replies: updateCommentsRecursively(comment.replies)
            };
          }
          return comment;
        });
      };

      const updatedComments = updateCommentsRecursively(comments);
      setComments(updatedComments);
      queryClient.setQueryData(["/api/posts/comments", postId], updatedComments);
      setEditingComment(null);
      toast({
        description: "Comment updated successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Edit mutation error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to update comment",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      if (!user?.id) throw new Error("You must be logged in to delete a comment");
      const res = await apiRequest("DELETE", `/api/posts/comments/${commentId}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to delete comment");
      }
      return res.json();
    },
    onSuccess: (data, commentId) => {
      // Update UI immediately by removing the deleted comment from the state
      const updatedComments = comments.filter(comment => comment.id !== commentId);
      setComments(updatedComments);

      // Also update the React Query cache to keep it in sync
      queryClient.setQueryData(["/api/posts/comments", postId], updatedComments);

      // Still invalidate the queries to ensure everything stays in sync with the server
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}/count`] });

      toast({
        description: "Comment deleted successfully",
      });
      setShowDeleteAlert(false);
      setCommentToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment",
      });
      setShowDeleteAlert(false);
      setCommentToDelete(null);
    },
  });

  const handleCopyComment = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      description: "Comment copied to clipboard",
    });
  };

  // Organize comments into threads more reliably
  // First, separate top-level comments and replies
  const topLevelComments: CommentWithReplies[] = [];
  const repliesByParentId: Record<number, CommentWithReplies[]> = {};

  // Process all comments first to ensure replies are properly categorized
  comments.forEach(comment => {
    const commentWithReplies = { ...comment, replies: [] };

    if (comment.parentId === postId) {
      // This is a top-level comment
      topLevelComments.push(commentWithReplies);
    } else if (comment.parentId) {
      // This is a reply to another comment (ensure parentId is not null)
      if (!repliesByParentId[comment.parentId]) {
        repliesByParentId[comment.parentId] = [];
      }
      repliesByParentId[comment.parentId].push(commentWithReplies);
    }
  });

  // Now attach all replies to their parent comments
  const threadedComments = topLevelComments.map(comment => {
    if (repliesByParentId[comment.id]) {
      comment.replies = repliesByParentId[comment.id];
    }
    return comment;
  });

  const formatTimeAgo = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      return `${diffInHours}h`;
    }
    return `${Math.floor(diffInHours / 24)}d`;
  };

  const CommentCard = ({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) => {
    const isOwnComment = user?.id === comment.author?.id;

    return (
      <div className={`space-y-4 ${depth > 0 ? 'ml-12 mt-3' : ''}`}>
        <div className="flex items-start gap-4">
          <Avatar>
            <AvatarImage
              src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`}
            />
            <AvatarFallback>{comment.author?.username?.[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 flex flex-col gap-2">
            <Card
              className={`w-full ${depth > 0 ? 'bg-gray-200 rounded-tl-none' : 'bg-gray-100'}`}
              onClick={() => {
                setSelectedComment(comment.id);
                setIsActionsOpen(true);
              }}
            >
              {depth > 0 && (
                <div className="absolute -left-8 -top-3 h-6 w-8 border-l-2 border-t-2 border-gray-300 rounded-tl-lg"></div>
              )}
              <CardContent className="pt-3 px-4 pb-3">
                <div className="flex justify-between">
                  <p className="font-medium">{comment.author?.username}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>

                {/* Display media if present */}
                {comment.mediaUrl && !comment.is_video && (
                  <div className="mt-2">
                    <img 
                      src={comment.mediaUrl} 
                      alt="Comment image" 
                      className="w-full h-auto object-contain rounded-md max-h-[300px]"
                    />
                  </div>
                )}
                {comment.mediaUrl && comment.is_video && (
                  <div className="mt-2">
                    <video
                      src={comment.mediaUrl}
                      controls
                      preload="metadata"
                      className="w-full h-auto object-contain rounded-md max-h-[300px]"
                      playsInline
                    />
                  </div>
                )}

                <div className="mt-2 flex justify-end">
                  <ReactionSummary postId={comment.id} />
                </div>
              </CardContent>
            </Card>
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {formatTimeAgo(comment.createdAt || new Date())}
              </p>
              <ReactionButton
                postId={comment.id}
                variant="text"
              />
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-7 text-sm text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyingTo(comment.id);
                }}
              >
                Reply
              </Button>
            </div>
          </div>
        </div>

        {/* Show replies */}
        {comment.replies?.map((reply) => (
          <CommentCard key={reply.id} comment={reply} depth={depth + 1} />
        ))}

        {editingComment === comment.id && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t z-[9999999]" style={{ zIndex: 2147483647, transform: 'translateZ(0)' }}>
            <div className="flex items-center mb-2">
              <p className="text-sm text-muted-foreground">
                Edit comment
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => setEditingComment(null)}
              >
                Cancel
              </Button>
            </div>
            <CommentForm
              onSubmit={async (content) => {
                await editCommentMutation.mutateAsync({ id: comment.id, content });
              }}
              isSubmitting={editCommentMutation.isPending}
              defaultValue={comment.content || ""}
              onCancel={() => setEditingComment(null)}
              inputRef={editInputRef}
            />
          </div>
        )}
      </div>
    );
  };

  // Find the selected comment data including nested replies
  const findSelectedComment = (comments: CommentWithReplies[]): CommentWithReplies | undefined => {
    for (const comment of comments) {
      if (comment.id === selectedComment) return comment;
      if (comment.replies) {
        const found = findSelectedComment(comment.replies);
        if (found) return found;
      }
    }
    return undefined;
  };

  const selectedCommentData = findSelectedComment(threadedComments);

  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
    if (editingComment && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [replyingTo, editingComment]);

  return (
    <>
      <div className="space-y-4 w-full">
        {threadedComments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </div>

      {replyingToComment && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t" style={{ zIndex: 2147483647, transform: 'translateZ(0)' }}>
          <div className="flex items-center mb-2">
            <p className="text-sm text-muted-foreground">
              Replying to {replyingToComment.author?.username}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setReplyingTo(null)}
            >
              Cancel
            </Button>
          </div>
          <CommentForm
            onSubmit={async (content) => {
              await createReplyMutation.mutateAsync(content);
            }}
            isSubmitting={createReplyMutation.isPending}
            placeholder={`Reply to ${replyingToComment.author?.username}...`}
            inputRef={replyInputRef}
            onCancel={() => setReplyingTo(null)}
          />
        </div>
      )}

      {selectedCommentData && (
        <CommentActionsDrawer
          isOpen={isActionsOpen}
          onClose={() => {
            setIsActionsOpen(false);
            setSelectedComment(null);
          }}
          onReply={() => {
            setReplyingTo(selectedComment);
            setIsActionsOpen(false);
          }}
          onEdit={() => {
            setEditingComment(selectedComment);
            setIsActionsOpen(false);
          }}
          onDelete={() => {
            setCommentToDelete(selectedComment);
            setShowDeleteAlert(true);
            setIsActionsOpen(false);
          }}
          onCopy={() => handleCopyComment(selectedCommentData.content || "")}
          canEdit={user?.id === selectedCommentData.author?.id}
          canDelete={user?.id === selectedCommentData.author?.id}
        />
      )}

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="z-[99999]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your comment and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteAlert(false);
                setCommentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (commentToDelete) {
                  deleteCommentMutation.mutate(commentToDelete);
                }
              }}
              disabled={deleteCommentMutation.isPending}
            >
              {deleteCommentMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}