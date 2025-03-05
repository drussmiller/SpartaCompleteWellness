import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { CommentForm } from "./comment-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { CommentActionsDrawer } from "./comment-actions-drawer";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;
}

type CommentWithReplies = Post & { 
  author: User; 
  replies?: CommentWithReplies[];
};

export function CommentList({ comments, postId }: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [selectedComment, setSelectedComment] = useState<number | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      const data = {
        type: "comment",
        content: content.trim(),
        parentId: replyingTo,
        points: 1,
        userId: user?.id
      };

      const res = await apiRequest("POST", "/api/posts", {
        data: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        description: "Reply posted successfully",
      });
      setReplyingTo(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post reply",
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const res = await apiRequest("PATCH", `/api/posts/${id}`, {
        data: JSON.stringify({ content: content.trim() })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        description: "Comment updated successfully",
      });
      setEditingComment(null);
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
      const res = await apiRequest("DELETE", `/api/posts/${commentId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        description: "Comment deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setIsActionsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment",
      });
      setIsDeleteDialogOpen(false);
    },
  });

  const handleCopyComment = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      description: "Comment copied to clipboard",
    });
  };

  // Find the comment we're replying to
  const replyingToComment = comments.find(c => c.id === replyingTo);

  // Organize comments into threads
  const threadedComments = comments.reduce<CommentWithReplies[]>((threads, comment) => {
    if (comment.parentId === postId) {
      // This is a top-level comment
      threads.push({ ...comment, replies: [] });
    } else {
      // This is a reply to another comment
      const parentComment = threads.find(thread => thread.id === comment.parentId);
      if (parentComment) {
        parentComment.replies = parentComment.replies || [];
        parentComment.replies.push({ ...comment, replies: [] });
      }
    }
    return threads;
  }, []);

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

    if (editingComment === comment.id) {
      return (
        <div className={`space-y-4 ${depth > 0 ? 'ml-12 mt-3' : ''}`}>
          <CommentForm
            onSubmit={async (content) => {
              await editCommentMutation.mutateAsync({ id: comment.id, content });
            }}
            isSubmitting={editCommentMutation.isPending}
            defaultValue={comment.content || ""}
            onCancel={() => setEditingComment(null)}
          />
        </div>
      );
    }

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
              </CardContent>
            </Card>
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {formatTimeAgo(comment.createdAt || new Date())}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm text-muted-foreground hover:text-foreground"
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

  return (
    <>
      <div className="space-y-4">
        {threadedComments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </div>

      {replyingToComment && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
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
            setIsDeleteDialogOpen(true);
          }}
          onCopy={() => handleCopyComment(selectedCommentData.content || "")}
          canEdit={user?.id === selectedCommentData.author?.id}
          canDelete={user?.id === selectedCommentData.author?.id}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This comment and all its replies will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCommentMutation.mutate(selectedComment)}
            >
              {deleteCommentMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </div>
              ) : (
                "Delete Comment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}