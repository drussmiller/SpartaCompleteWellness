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
import { VideoPlayer } from "@/components/ui/video-player";
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
  onVisibilityChange?: (isEditing: boolean, isReplying: boolean) => void; // Added prop for visibility callback
}

type CommentWithReplies = Post & {
  author: User;
  replies?: CommentWithReplies[];
};

export function CommentList({ comments: initialComments, postId, onVisibilityChange }: CommentListProps) {
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
    mutationFn: async (data: { content: string; file?: File }) => {
      if (!replyingTo) throw new Error("No comment selected to reply to");
      if (!user?.id) throw new Error("You must be logged in to reply");

      const formData = new FormData();
      formData.append('data', JSON.stringify({
        content: data.content.trim(),
        parentId: replyingTo,
        postId: postId,
        type: 'comment'
      }));

      if (data.file) {
        formData.append('image', data.file);
      }

      const res = await fetch('/api/posts/comments', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to post reply");
      }

      return res.json();
    },
    onSuccess: (_data, _variables, context) => {
      // Extract the parentCommentId from context (if needed)
      const repliedToCommentId = replyingTo;

      // Reset states
      setReplyingTo(null);
      
      // Signal to parent that we're no longer replying
      if (onVisibilityChange) {
        onVisibilityChange(false, false);
      }

      // Refresh comments to include the new reply
      fetch(`/api/posts/comments/${postId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error refreshing comments: ${res.status}`);
        }
        return res.json();
      })
      .then(refreshedComments => {
        if (Array.isArray(refreshedComments)) {
          // Sort comments by creation date (oldest first to display newest at bottom)
          const sortedComments = [...refreshedComments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA.getTime() - dateB.getTime(); // Keep ascending order to show newest at bottom
          });
          setComments(sortedComments);
          queryClient.setQueryData(["/api/posts/comments", postId], sortedComments);
          queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}/count`] });
          toast({
            description: 
              <div className="flex flex-col">
                <div>Reply added successfully</div>
                <button 
                  className="text-xs text-primary hover:underline text-left mt-1"
                  onClick={() => setReplyingTo(repliedToCommentId)}
                >
                  Reply again to this comment
                </button>
              </div>,
            duration: 5000,
          });
        }
      })
      .catch(err => {
        console.error("Error refreshing comments after reply:", err);
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
        throw new Error("Comment cannot be empty");
      }
      
      const res = await fetch(`/api/posts/comments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
        credentials: 'include'
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to update comment");
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      // Update the comments state with the edited comment
      const updatedComments = comments.map(comment => 
        comment.id === data.id ? { ...comment, content: data.content } : comment
      );
      
      setComments(updatedComments);
      setEditingComment(null);
      
      // Signal to parent that we're no longer editing
      if (onVisibilityChange) {
        onVisibilityChange(false, false);
      }
      
      toast({
        description: "Comment updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to update comment",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await fetch(`/api/posts/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to delete comment");
      }
      return res.json();
    },
    onSuccess: (data, commentId) => {
      fetch(`/api/posts/comments/${postId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error refreshing comments: ${res.status}`);
        }
        return res.json();
      })
      .then(refreshedComments => {
        if (Array.isArray(refreshedComments)) {
          // Sort comments by creation date (oldest first to display newest at bottom)
          const sortedComments = [...refreshedComments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA.getTime() - dateB.getTime(); // Keep ascending order to show newest at bottom
          });
          setComments(sortedComments);
          queryClient.setQueryData(["/api/posts/comments", postId], sortedComments);
          queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}/count`] });
        }
      })
      .catch(err => {
        console.error("Error refreshing comments after delete:", err);
      });

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

  // Find the comment we're editing
  const editingCommentObj = comments.find(c => c.id === editingComment);

  // This effect is for handling showing/hiding the form when replying or editing
  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(Boolean(editingComment), Boolean(replyingTo));
    }
  }, [editingComment, replyingTo, onVisibilityChange]);

  // This effect is to focus the input field when replying
  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  // This effect is to focus the input field when editing
  useEffect(() => {
    if (editingComment && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingComment]);

  // Update local state when initialComments change
  useEffect(() => {
    // Sort by date (oldest first)
    const sortedComments = [...initialComments].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateA.getTime() - dateB.getTime();
    });
    setComments(sortedComments);
  }, [initialComments]);

  // Function to toggle reply mode
  const handleReply = (commentId: number) => {
    if (replyingTo === commentId) {
      setReplyingTo(null);
    } else {
      setReplyingTo(commentId);
      setEditingComment(null);
    }
  };

  // Function to toggle edit mode
  const handleEdit = (commentId: number) => {
    if (editingComment === commentId) {
      setEditingComment(null);
    } else {
      setEditingComment(commentId);
      setReplyingTo(null);
    }
  };

  // Function to show delete confirmation
  const handleDelete = (commentId: number) => {
    setCommentToDelete(commentId);
    setShowDeleteAlert(true);
  };

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <div key={comment.id} className="mb-4 relative">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start space-x-2">
                <Avatar className="h-8 w-8 bg-slate-200">
                  <AvatarImage src={comment.author?.avatar || ''} alt={comment.author?.username || 'User'} />
                  <AvatarFallback>{comment.author?.username?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between">
                    <div className="font-medium text-sm">{comment.author?.preferredName || comment.author?.username || 'Anonymous'}</div>
                    {user?.id === comment.author?.id && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-muted-foreground"
                        onClick={() => {
                          setSelectedComment(comment.id);
                          setIsActionsOpen(true);
                        }}
                      >
                        •••
                      </Button>
                    )}
                  </div>
                  
                  {editingComment === comment.id ? (
                    <CommentForm 
                      onSubmit={(content, file) => {
                        editCommentMutation.mutate({ 
                          id: comment.id, 
                          content: content 
                        });
                      }}
                      initialContent={comment.content || ''}
                      isSubmitting={editCommentMutation.isPending}
                      onCancel={() => setEditingComment(null)}
                      inputRef={editInputRef}
                      isEditMode={true}
                    />
                  ) : (
                    <>
                      <div className="text-sm">
                        {comment.content}
                      </div>
                      
                      {comment.imageUrl && (
                        <div className="mt-2">
                          {comment.is_video ? (
                            <VideoPlayer
                              src={comment.imageUrl}
                              className="rounded-md max-h-[200px] object-contain"
                            />
                          ) : (
                            <img 
                              src={comment.imageUrl} 
                              alt="Comment attachment" 
                              className="rounded-md max-h-[200px] object-contain" 
                            />
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center mt-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-muted-foreground"
                          onClick={() => handleReply(comment.id)}
                        >
                          <MessageCircle className="h-4 w-4 mr-1" />
                          Reply
                        </Button>
                        
                        <div className="flex ml-auto">
                          <ReactionButton postId={comment.id} type="like" />
                          <ReactionButton postId={comment.id} type="clap" />
                          <ReactionButton postId={comment.id} type="pray" />
                        </div>
                      </div>
                      
                      <ReactionSummary postId={comment.id} />
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          {replyingTo === comment.id && (
            <div className="ml-8 mt-2">
              <CommentForm 
                onSubmit={(content, file) => createReplyMutation.mutate({ content, file })}
                isSubmitting={createReplyMutation.isPending}
                onCancel={() => setReplyingTo(null)}
                placeholder={`Reply to ${comment.author?.preferredName || comment.author?.username || 'comment'}...`}
                inputRef={replyInputRef}
              />
            </div>
          )}
        </div>
      ))}
      
      <CommentActionsDrawer 
        isOpen={isActionsOpen} 
        onOpenChange={setIsActionsOpen}
        onEdit={() => {
          setIsActionsOpen(false);
          if (selectedComment) handleEdit(selectedComment);
        }}
        onDelete={() => {
          setIsActionsOpen(false);
          if (selectedComment) handleDelete(selectedComment);
        }}
      />
      
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteAlert(false)}
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
    </div>
  );
}