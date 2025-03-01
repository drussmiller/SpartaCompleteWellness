import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";
import { formatDistance } from "date-fns";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Post } from "@shared/schema";

type CommentWithAuthor = {
  id: number;
  content: string;
  userId: number;
  parentId: number;
  createdAt: string;
  author: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: CommentWithAuthor[];
};

function CommentActions({
  comment,
  onEdit,
  onDelete,
  onCopy,
  onReply,
  onClose,
  showReply = true
}: {
  comment: CommentWithAuthor;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onReply: () => void;
  onClose: () => void;
  showReply?: boolean;
}) {
  return (
    <div className="bg-white rounded-t-xl overflow-hidden shadow-lg">
      <div className="flex flex-col w-full">
        <div className="text-center py-3 border-b border-gray-200 font-semibold text-lg">
          Comment Actions
        </div>

        {showReply && (
          <button
            className="w-full p-4 text-blue-500 font-semibold flex justify-center border-b hover:bg-gray-50"
            onClick={() => {
              onReply();
              onClose();
            }}
          >
            Reply
          </button>
        )}

        <button
          className="w-full p-4 text-blue-500 font-semibold flex justify-center border-b hover:bg-gray-50"
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          Edit
        </button>

        <button
          className="w-full p-4 text-red-500 font-semibold flex justify-center border-b hover:bg-gray-50"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete
        </button>

        <button
          className="w-full p-4 text-gray-700 font-semibold flex justify-center border-b hover:bg-gray-50"
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          Copy
        </button>

        <button
          className="w-full p-4 bg-gray-200 text-gray-700 font-semibold flex justify-center mt-2 mb-safe"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Comment({
  comment,
  postId,
  onReply,
  onRefetch,
  depth = 0
}: {
  comment: CommentWithAuthor;
  postId: number;
  onReply: (commentId: number, username: string) => void;
  onRefetch: () => void;
  depth?: number;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [showReplies, setShowReplies] = useState(depth < 1);
  const [showActions, setShowActions] = useState(false);

  // Maximum nesting level
  const maxDepth = 3;
  const canShowMoreReplies = depth < maxDepth;

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
      onRefetch(); // Refresh the comment list
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment"
      });
    }
  });

  const updateCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("PATCH", `/api/comments/${comment.id}`, { content });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to update comment" }));
        throw new Error(error.message || "Failed to update comment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Comment updated successfully" });
      onRefetch(); // Refresh the comment list
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to update comment"
      });
    }
  });

  const handleSaveEdit = () => {
    if (editText.trim() === '') {
      toast({
        variant: "destructive",
        description: "Comment cannot be empty"
      });
      return;
    }
    updateCommentMutation.mutateAsync(editText);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(comment.content);
    toast({ description: "Comment copied to clipboard" });
  };

  const isOwnComment = user?.id === comment.author.id;
  const hasReplies = comment.replies && comment.replies.length > 0;

  return (
    <div className={`my-2 ${depth > 0 ? 'ml-4 pl-4 border-l border-gray-200' : ''}`}>
      <div className="flex items-start space-x-2 group">
        <Avatar className="h-8 w-8 mt-1">
          {comment.author.imageUrl ? (
            <AvatarImage src={comment.author.imageUrl} alt={comment.author.username} />
          ) : (
            <AvatarFallback>{comment.author.username.charAt(0).toUpperCase()}</AvatarFallback>
          )}
        </Avatar>

        <div className="flex-1">
          <div className="bg-gray-100 rounded-2xl px-3 py-2">
            <div className="font-semibold text-sm">{comment.author.username}</div>

            {isEditing ? (
              <div className="mt-1">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[60px] p-2 text-sm"
                  autoFocus
                />
                <div className="flex justify-end space-x-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      setEditText(comment.content);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={updateCommentMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-line">{comment.content}</p>
            )}
          </div>

          <div className="flex items-center mt-1 space-x-3 text-xs text-gray-500">
            <span>{formatDistance(new Date(comment.createdAt), new Date(), { addSuffix: true })}</span>

            <Drawer>
              <DrawerTrigger asChild>
                <button className="font-medium hover:underline">Reply</button>
              </DrawerTrigger>
              <DrawerContent>
                <CommentActions
                  comment={comment}
                  onEdit={() => isOwnComment && setIsEditing(true)}
                  onDelete={() => isOwnComment && deleteCommentMutation.mutateAsync()}
                  onCopy={handleCopyText}
                  onReply={() => onReply(comment.id, comment.author.username)}
                  onClose={() => setShowActions(false)}
                  showReply={true}
                />
              </DrawerContent>
            </Drawer>

            {hasReplies && (
              <button
                className="font-medium hover:underline flex items-center"
                onClick={() => setShowReplies(!showReplies)}
              >
                {showReplies ? 'Hide replies' : `Show ${comment.replies!.length} replies`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Render nested replies */}
      {showReplies && hasReplies && (
        <div className="mt-2">
          {comment.replies!.map((reply) => (
            <Comment
              key={reply.id}
              comment={reply}
              postId={postId}
              onReply={onReply}
              onRefetch={onRefetch}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PostComments({ postId }: { postId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number | null; username: string | null }>({ id: null, username: null });
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [], isLoading, refetch } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!postId
  });

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const parentId = replyTo.id || postId;
      const depth = replyTo.id ? 1 : 0; // Set depth based on if it's a reply

      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: content.trim(),
        parentId,
        depth,
        imageUrl: null
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to post comment" }));
        throw new Error(error.message || "Failed to post comment");
      }

      return res.json();
    },
    onSuccess: () => {
      setComment("");
      setReplyTo({ id: null, username: null });
      refetch();
      toast({ description: "Comment posted successfully" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment"
      });
    }
  });

  const handleSubmitComment = () => {
    if (!comment.trim()) return;
    createCommentMutation.mutateAsync(comment);
  };

  const handleReply = (commentId: number, username: string) => {
    setReplyTo({ id: commentId, username });
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 100);
  };

  useEffect(() => {
    // Auto-focus the comment input when it's for a reply
    if (replyTo.id && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [replyTo.id]);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          {/* Comments list */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              comments.map((comment) => (
                <Comment
                  key={comment.id}
                  comment={comment}
                  postId={postId}
                  onReply={handleReply}
                  onRefetch={refetch}
                />
              ))
            )}
          </div>

          {/* Comment input - Facebook style */}
          <div className="border rounded-lg overflow-hidden mt-4 bg-white">
            <div className="flex items-start p-3">
              <Avatar className="h-8 w-8 mr-2">
                {user?.imageUrl ? (
                  <AvatarImage src={user.imageUrl} alt={user.username} />
                ) : (
                  <AvatarFallback>{user?.username.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
                  <Textarea
                    ref={commentInputRef}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={replyTo.id ? `Reply to ${replyTo.username}...` : "Write a comment..."}
                    className="flex-1 bg-transparent border-none resize-none min-h-0 px-0 py-0 focus-visible:ring-0 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleSubmitComment();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSubmitComment}
                    disabled={!comment.trim() || createCommentMutation.isPending}
                    className="rounded-full p-2 h-8 w-8"
                  >
                    {createCommentMutation.isPending ? (
                      <span className="flex items-center">
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                        Posting...
                      </span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                      </svg>
                    )}
                  </Button>
                </div>

                {replyTo.id && (
                  <div className="flex items-center text-xs text-blue-500 mb-2">
                    <span>Replying to {replyTo.username}</span>
                    <button
                      className="ml-2 text-gray-500 hover:text-gray-700"
                      onClick={() => setReplyTo({ id: null, username: null })}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}