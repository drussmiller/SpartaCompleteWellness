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
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { CommentContextMenu } from './comment-context-menu';

interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;  // Add postId prop to handle replies
}

type CommentWithReplies = Post & { author: User; replies?: CommentWithReplies[] };

export function CommentList({ comments, postId }: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [contextMenuComment, setContextMenuComment] = useState<number | null>(null);
  const { user } = useAuth();

  console.log("\n=== CommentList Mount ===");
  console.log("Current location:", window.location.href);
  console.log("Comments received:", comments);

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!replyingTo) {
        console.error("No comment selected to reply to");
        throw new Error("No comment selected to reply to");
      }

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

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error creating reply:", errorText);
        throw new Error(errorText);
      }
      return res.json();
    },
    onSuccess: (newComment) => {
      console.log("Reply created successfully:", newComment);

      // Manually update the query data to include the new reply
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      // Reset replying state
      setReplyingTo(null);

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

  // First fetch all direct comments and replies regardless of parent
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

  // Effect to refetch comments after mutation
  useEffect(() => {
    if (replyingTo === null && createReplyMutation.isSuccess) {
      // Invalidate queries to refetch comments
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    }
  }, [createReplyMutation.isSuccess, replyingTo, postId]);

  // Transform flat comments into a threaded structure with nested replies
  const threadedComments = comments.reduce<CommentWithReplies[]>((threads, comment) => {
    // For the comments page, all comments with parentId equal to postId are top-level
    if (comment.parentId === postId) {
      // This is a root level comment for this post
      threads.push({ ...comment, replies: [] });
    } else {
      // This is a reply to another comment, need to find where to place it
      const findParentAndAddReply = (commentsList: CommentWithReplies[]) => {
        for (const thread of commentsList) {
          if (thread.id === comment.parentId) {
            // Found direct parent
            thread.replies = thread.replies || [];
            thread.replies.push({ ...comment, replies: [] });
            return true;
          }

          // Check if it's a reply to a reply (nested)
          if (thread.replies && thread.replies.length > 0) {
            const found = findParentAndAddReply(thread.replies);
            if (found) return true;
          }
        }
        return false;
      };

      // Try to find the parent in the thread structure
      const found = findParentAndAddReply(threads);

      // If not found (could be a reply to a comment that's not yet in our structure)
      if (!found) {
        // Try to find the original comment this might be a reply to
        const originalComment = comments.find(c => c.id === comment.parentId);
        if (originalComment) {
          // If we found the original comment, add this as a reply to it
          const parent = threads.find(t => t.id === originalComment.id);
          if (parent) {
            parent.replies = parent.replies || [];
            parent.replies.push({ ...comment, replies: [] });
          } else {
            // If parent isn't in threads yet, add it with this reply
            threads.push({
              ...originalComment,
              replies: [{ ...comment, replies: [] }]
            });
          }
        } else {
          // Last resort, add to top level
          threads.push({ ...comment, replies: [] });
        }
      }
    }
    return threads;
  }, []);

  console.log("Threaded comments structure:", JSON.stringify(threadedComments, null, 2));
  // Log all comments to see what we're working with
  console.log("Raw comments from API:", JSON.stringify(comments, null, 2));

  if (!comments.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
        </CardContent>
      </Card>
    );
  }

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


  const CommentCard = ({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) => {
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
              className={`w-full ${depth > 0 ? 'bg-gray-200 rounded-tl-none' : 'bg-gray-100'} cursor-pointer`}
              onClick={(e) => {
                e.stopPropagation();
                console.log("Comment clicked, setting context menu for comment ID:", comment.id);
                setContextMenuComment(comment.id);
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
            <div className="flex items-center"> {/* Added items-center to vertically align elements */}
              <p className="text-sm text-muted-foreground mr-2 flex items-center">{formatTimeAbbreviated(comment.createdAt!)}</p>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1.5 h-6 py-0"
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

        {/* Show reply form when replying to this comment */}
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
                try {
                  await createReplyMutation.mutateAsync(content);
                } catch (error) {
                  console.error("Failed to submit reply:", error);
                  // Keep the form open on error
                }
              }}
              isSubmitting={createReplyMutation.isPending}
              placeholder={`Reply to ${comment.author?.username}...`}
            />
            {createReplyMutation.isError && (
              <p className="text-red-500 text-sm mt-1">
                Failed to post reply. Please try again.
              </p>
            )}
          </div>
        )}

        {comment.replies?.map((reply) => (
          <CommentCard key={reply.id} comment={reply} depth={depth + 1} />
        ))}
      </div>
    );
  };

  const threaded = threadedComments;
  const selectedComment = comments.find(c => c.id === contextMenuComment);
  const canEditComment = selectedComment && user && selectedComment.userId === user.id;
  
  // Debug logging for context menu state
  console.log("Context menu state:", { 
    contextMenuComment, 
    selectedCommentExists: !!selectedComment,
    canEdit: canEditComment 
  });

  return (
    <div className="space-y-6">
      {threaded.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
      ) : (
        threaded.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))
      )}

      {replyingTo && (
        <div className="bg-gray-50 p-4 rounded-lg border">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Reply to comment</h3>
            <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>Cancel</Button>
          </div>
          <CommentForm
            onSubmit={async (content) => {
              await createReplyMutation.mutateAsync(content);
              setReplyingTo(null);
            }}
            isSubmitting={createReplyMutation.isPending}
          />
        </div>
      )}

      <CommentContextMenu
        isOpen={contextMenuComment !== null}
        onClose={() => setContextMenuComment(null)}
        onReply={() => {
          if (contextMenuComment) {
            setReplyingTo(contextMenuComment);
            setContextMenuComment(null);
          }
        }}
        onEdit={() => {
          // Implement edit functionality later
          setContextMenuComment(null);
        }}
        onDelete={() => {
          // Implement delete functionality later
          setContextMenuComment(null);
        }}
        onCopy={() => {
          const commentContent = selectedComment?.content;
          if (commentContent) {
            navigator.clipboard.writeText(commentContent);
          }
          setContextMenuComment(null);
        }}
        canEdit={!!canEditComment}
      />
    </div>
  );
}