import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDistance } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

interface Comment {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
  };
}

export function PostComments({ postId }: { postId: number }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/posts/comments/${postId}`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "comment",
          content: newComment.trim(),
          parentId: postId,
          imageUrl: null,
        }),
      });

      if (response.ok) {
        setNewComment("");
        fetchComments();
      }
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {comments.length > 0 ? (
        comments.map((comment) => (
          <div key={comment.id} className="flex space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarImage 
                src={comment.author?.imageUrl || `/default-avatar.jpg`} 
                alt={comment.author?.username} 
              />
              <AvatarFallback>
                {comment.author?.username?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <p className="font-medium text-sm">
                  {comment.author?.username || "Anonymous"}
                </p>
                <span className="text-xs text-gray-500">
                  {formatDistance(new Date(comment.createdAt), new Date(), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm mt-1">{comment.content}</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-center text-gray-500 text-sm">No comments yet. Be the first to comment!</p>
      )}

      {user && (
        <div className="mt-4 space-y-2">
          <Textarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px] w-full"
          />
          <div className="flex justify-end">
            <Button 
              onClick={handleSubmitComment} 
              disabled={!newComment.trim() || submitting}
              size="sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                "Post Comment"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}