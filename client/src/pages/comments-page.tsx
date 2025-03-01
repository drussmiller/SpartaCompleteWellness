
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, ChevronLeft, Send } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Post } from "@shared/schema";
import { formatDistance } from "date-fns";

type CommentWithAuthor = Post & {
  author: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: CommentWithAuthor[];
  depth?: number;
};

export default function CommentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { postId } = useParams();
  const [, setLocation] = useLocation();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: originalPost, isLoading: isPostLoading } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) throw new Error("Failed to fetch post");
      return res.json();
    },
    enabled: !!postId
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
        imageUrl: null,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to post comment" }));
        throw new Error(error.message || "Failed to post comment");
      }
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      setReplyTo(null);
      // Refetch the comments
      refetch();
      // Also update the post list to reflect the new comment count
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment"
      });
    }
  });

  const handleReply = (commentId: number, username: string) => {
    setReplyTo(commentId);
    setComment(`@${username} `);
    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleSubmitComment = async () => {
    if (!comment.trim()) return;

    try {
      await createCommentMutation.mutateAsync();
    } catch (error) {
      // Error handling is already done in the mutation
    }
  };

  // Animation effect when the page loads
  useEffect(() => {
    const container = document.getElementById('comments-container');
    if (container) {
      container.classList.add('slide-in-active');
    }
  }, []);

  if (isPostLoading || areCommentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div id="comments-container" className="fixed inset-0 z-50 bg-white slide-in">
      <header className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="p-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(-1)} 
            className="mr-2 h-10 w-10 bg-gray-200 hover:bg-gray-300 rounded-md flex items-center justify-center"
          >
            <ChevronLeft className="h-6 w-6 text-black" />
          </Button>
          <h1 className="text-xl font-bold truncate">Comments</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 pb-28">
        {originalPost && (
          <div className="mb-6">
            <div className="mb-6 p-4 border rounded-lg bg-white">
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={originalPost.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author?.username}`} />
                  <AvatarFallback>{originalPost.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{originalPost.author?.username}</div>
                    <p className="text-xs text-muted-foreground">
                      {originalPost.createdAt && new Date(originalPost.createdAt).toLocaleString()}
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
                postId={parseInt(postId!)}
                onReply={handleReply}
                onRefetch={refetch}
              />
            ))
          )}
        </div>
      </main>

      {/* Comment input - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-3">
        {replyTo && (
          <div className="flex justify-between items-center mb-2 px-2 py-1 bg-gray-100 rounded">
            <span className="text-sm text-gray-600">
              Replying to comment
            </span>
            <button 
              onClick={() => {
                setReplyTo(null);
                setComment("");
              }}
              className="text-sm text-blue-600"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            {user?.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt={user.username} />
            ) : (
              <AvatarFallback>{user?.username.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <Textarea
            ref={commentInputRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 min-h-[40px] resize-none border rounded-full px-4 py-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmitComment();
              }
            }}
          />
          <Button 
            size="icon" 
            onClick={handleSubmitComment}
            disabled={!comment.trim()}
            className="rounded-full h-10 w-10 bg-blue-500 text-white hover:bg-blue-600"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
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
      const res = await apiRequest("DELETE", `/api/posts/${comment.id}`);
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

  const editCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/posts/${comment.id}`, {
        content: editText.trim()
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to edit comment" }));
        throw new Error(error.message || "Failed to edit comment");
      }
    },
    onSuccess: () => {
      setIsEditing(false);
      toast({ description: "Comment updated successfully" });
      onRefetch(); // Refresh the comment list
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to edit comment"
      });
    }
  });

  const formattedDate = comment.createdAt
    ? formatDistance(new Date(comment.createdAt), new Date(), { addSuffix: true })
    : '';

  return (
    <div className={`pl-${depth * 4} border-l-2 border-gray-100 ml-${depth * 2}`}>
      <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`} />
          <AvatarFallback>{comment.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <span className="font-medium text-sm">{comment.author?.username}</span>
            <div className="relative">
              <button 
                onClick={() => setShowActions(!showActions)}
                className="text-gray-500 p-1 hover:bg-gray-200 rounded-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
              </button>
              
              {showActions && (
                <div className="absolute right-0 mt-1 w-40 bg-white shadow-lg rounded-md z-10 border">
                  <button
                    onClick={() => onReply(comment.id, comment.author.username)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Reply
                  </button>
                  
                  {(user?.id === comment.userId || user?.isAdmin) && (
                    <>
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setShowActions(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this comment?")) {
                            deleteCommentMutation.mutate();
                          }
                          setShowActions(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {isEditing ? (
            <div className="mt-1">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[60px] text-sm"
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
                  onClick={() => editCommentMutation.mutate()}
                  disabled={!editText.trim() || editText.trim() === comment.content}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm break-words whitespace-pre-wrap">{comment.content}</p>
              <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                <span>{formattedDate}</span>
                <button 
                  onClick={() => onReply(comment.id, comment.author.username)}
                  className="font-medium hover:underline"
                >
                  Reply
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Nested replies if any */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="pl-6 mt-2 space-y-2">
          {showReplies ? (
            comment.replies.map((reply) => (
              <Comment
                key={reply.id}
                comment={reply}
                postId={postId}
                onReply={onReply}
                onRefetch={onRefetch}
                depth={depth + 1}
              />
            ))
          ) : (
            <button
              onClick={() => setShowReplies(true)}
              className="text-sm text-blue-600 hover:underline ml-8"
            >
              Show {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
