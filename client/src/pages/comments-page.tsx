
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

type PostWithAuthor = Post & {
  author: {
    id: number;
    username: string;
    imageUrl?: string;
  };
};

type Comment = PostWithAuthor & {
  replies?: Comment[];
};

export function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const postQuery = React.useQuery({
    queryKey: [`/api/posts/${postId}`],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch post');
      }
      return res.json() as Promise<PostWithAuthor>;
    }
  });

  const commentsQuery = React.useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: async () => {
      const res = await fetch(`/api/posts/comments/${postId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch comments');
      }
      return res.json() as Promise<Comment[]>;
    }
  });

  const addCommentMutation = React.useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/posts', 'POST', {
        type: 'comment',
        content: comment,
        parentId: Number(postId),
        depth: 0,
        imageUrl: null
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to post comment" }));
        throw new Error(error.message || "Failed to post comment");
      }

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Comment added",
        description: "Your comment has been added successfully"
      });
      setComment("");
      commentsQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add comment",
        variant: "destructive"
      });
    }
  });

  const renderComment = (comment: Comment, depth = 0) => {
    return (
      <div 
        key={comment.id}
        className={`p-4 border rounded-lg mb-2 ${depth > 0 ? 'ml-6' : ''}`}
      >
        <div className="flex items-start gap-3 mb-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={comment.author.imageUrl} />
            <AvatarFallback>{comment.author.username.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-semibold text-sm">{comment.author.username}</div>
            <p className="text-sm text-gray-700">{comment.content}</p>
          </div>
        </div>
        {comment.replies?.map(reply => renderComment(reply, depth + 1))}
      </div>
    );
  };

  return (
    <div className="container max-w-2xl mx-auto pb-20 pt-4">
      <div className="p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="mr-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-bold text-xl inline-block">Comments</h1>
      </div>

      {postQuery.isLoading ? (
        <div className="flex justify-center p-4">Loading post...</div>
      ) : postQuery.error ? (
        <div className="p-4 text-red-500">
          {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
        </div>
      ) : postQuery.data && (
        <div className="p-4 border-b mb-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={postQuery.data.author?.imageUrl} />
              <AvatarFallback>{postQuery.data.author?.username.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold">{postQuery.data.author?.username}</div>
              <p className="text-gray-700">{postQuery.data.content}</p>
              {postQuery.data.imageUrl && (
                <img 
                  src={postQuery.data.imageUrl} 
                  alt="Post"
                  className="mt-2 rounded-lg max-h-64 object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}

        <h2 className="font-semibold text-lg mb-4">Comments</h2>

        {commentsQuery.isLoading ? (
          <div className="flex justify-center p-4">Loading comments...</div>
        ) : commentsQuery.error ? (
          <div className="p-4 text-red-500">
            {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Failed to load comments'}
          </div>
        ) : commentsQuery.data?.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No comments yet</div>
        ) : (
          <div className="space-y-4 p-4">
            {commentsQuery.data?.map(comment => renderComment(comment))}
          </div>
        )}

      {user && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1"
            />
            <Button 
              onClick={() => addCommentMutation.mutate()}
              disabled={!comment.trim() || addCommentMutation.isPending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
