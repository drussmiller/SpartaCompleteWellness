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
  const { user } = useAuth();
  const { toast } = useToast();

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      const data = {
        type: "comment",
        content: content.trim(),
        parentId: replyingTo,
        points: 1
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
            toast({
              description: "Edit functionality coming soon",
            });
          }}
          onDelete={() => {
            toast({
              description: "Delete functionality coming soon",
            });
          }}
          onCopy={() => handleCopyComment(selectedCommentData.content || "")}
          canEdit={user?.id === selectedCommentData.author?.id}
          canDelete={user?.id === selectedCommentData.author?.id}
        />
      )}
    </>
  );
}