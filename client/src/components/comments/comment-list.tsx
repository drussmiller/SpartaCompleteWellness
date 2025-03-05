import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { CommentForm } from "./comment-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { CommentActionsDrawer } from "./comment-actions-drawer";
import { useAuth } from "@/hooks/use-auth";


interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;  // Add postId prop to handle replies
}

type CommentWithReplies = Post & { author: User; replies?: CommentWithReplies[] };

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
      console.log("Creating reply with data:", data);

      // The server expects 'data' property as a JSON string
      const res = await apiRequest("POST", "/api/posts", {
        data: JSON.stringify(data)
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (newComment) => {
      console.log("Reply created successfully:", newComment);

      // Manually update the query data to include the new reply
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });

      toast({
        description: "Reply posted successfully",
      });
      setReplyingTo(null);
    },
    onError: (error: Error) => {
      console.error("Reply error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to post reply",
      });
    },
  });

  const fetchAllComments = async () => {
    console.log("Fetching all comments for post:", postId);
    try {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      return data;
    } catch (error) {
      console.error("Error fetching all comments:", error);
      return [];
    }
  };

  useEffect(() => {
    if (replyingTo === null && createReplyMutation.isSuccess) {
      // Invalidate queries to refetch comments
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    }
  }, [createReplyMutation.isSuccess, replyingTo, postId]);

  const threadedComments = comments.reduce<CommentWithReplies[]>((threads, comment) => {
    if (comment.parentId === postId) {
      threads.push({ ...comment, replies: [] });
    } else {
      const findParentAndAddReply = (commentsList: CommentWithReplies[]) => {
        for (const thread of commentsList) {
          if (thread.id === comment.parentId) {
            thread.replies = thread.replies || [];
            thread.replies.push({ ...comment, replies: [] });
            return true;
          }

          if (thread.replies && thread.replies.length > 0) {
            const found = findParentAndAddReply(thread.replies);
            if (found) return true;
          }
        }
        return false;
      };

      const found = findParentAndAddReply(threads);

      if (!found) {
        const originalComment = comments.find(c => c.id === comment.parentId);
        if (originalComment) {
          const parent = threads.find(t => t.id === originalComment.id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push({ ...comment, replies: [] });
          } else {
            threads.push({
              ...originalComment,
              replies: [{ ...comment, replies: [] }]
            });
          }
        } else {
          threads.push({ ...comment, replies: [] });
        }
      }
    }
    return threads;
  }, []);

  const handleCopyComment = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      description: "Comment copied to clipboard",
    });
  };

  const CommentCard = ({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) => {
    const isOwnComment = user?.id === comment.author?.id;

    return (
      <div className={`space-y-4 ${depth > 0 ? 'ml-12 mt-3' : ''}`}>
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            <Avatar>
              <AvatarImage
                src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`}
              />
              <AvatarFallback>{comment.author?.username?.[0].toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
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
              <CardContent className="pt-3 px-4 pb-3 relative">
                <div className="flex justify-between">
                  <p className="font-medium">{comment.author?.username}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
              </CardContent>
            </Card>
            <div className="flex items-center">
              <p className="text-sm text-muted-foreground mr-2 flex items-center">
                {formatTimeAbbreviated(comment.createdAt!)}
              </p>
            </div>
          </div>
        </div>

        {replyingTo === comment.id && (
          <div className="ml-12 mt-2 pl-4 border-l-2 border-gray-300">
            <div className="flex items-center mb-2">
              <p className="text-sm text-muted-foreground">Replying to {comment.author?.username}</p>
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
              placeholder={`Reply to ${comment.author?.username}...`}
            />
          </div>
        )}

        {comment.replies?.map((reply) => (
          <CommentCard key={reply.id} comment={reply} depth={depth + 1} />
        ))}
      </div>
    );
  };

  const formatTimeAbbreviated = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60)); // difference in hours

    if (diff < 24) {
      return `${diff}h`;
    } else {
      const days = Math.floor(diff / 24);
      return `${days}d`;
    }
  };

  const selectedCommentData = comments.find(c => c.id === selectedComment) ||
    comments.flatMap(c => c.replies || []).find(r => r?.id === selectedComment);

  return (
    <>
      <div className="space-y-4">
        {threadedComments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </div>

      {selectedCommentData && (
        <CommentActionsDrawer
          isOpen={isActionsOpen}
          onClose={() => {
            setIsActionsOpen(false);
            setSelectedComment(null);
          }}
          onReply={() => setReplyingTo(selectedComment)}
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