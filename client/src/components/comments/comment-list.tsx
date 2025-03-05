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

interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;  // Add postId prop to handle replies
}

type CommentWithReplies = Post & { author: User; replies?: CommentWithReplies[] };

export function CommentList({ comments, postId }: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const { toast } = useToast();

  console.log("CommentList rendering with:", { comments, postId });

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      const data = {
        type: "comment",
        content: content.trim(),
        parentId: replyingTo,
        points: 1
      };
      console.log("Creating reply with data:", data);
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

  // Transform flat comments into a threaded structure
  const threadedComments = comments.reduce<CommentWithReplies[]>((threads, comment) => {
    if (!comment.parentId) {
      // This is a root level comment
      threads.push({ ...comment, replies: [] });
    } else {
      // This is a reply, find its parent and add it to replies
      const parentThread = threads.find(t => t.id === comment.parentId);
      if (parentThread) {
        parentThread.replies = parentThread.replies || [];
        parentThread.replies.push(comment);
      }
    }
    return threads;
  }, []);

  console.log("Threaded comments:", threadedComments);

  if (!comments.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
        </CardContent>
      </Card>
    );
  }

  const CommentCard = ({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) => (
    <div className={`space-y-4 ${depth > 0 ? 'ml-8 border-l pl-4' : ''}`}>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Avatar>
              <AvatarImage 
                src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`} 
              />
              <AvatarFallback>{comment.author?.username?.[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex justify-between">
                <p className="font-medium">{comment.author?.username}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(comment.createdAt!).toLocaleString()}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{comment.content}</p>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setReplyingTo(comment.id)}
                >
                  <MessageCircle className="h-4 w-4" />
                  Reply
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {replyingTo === comment.id && (
        <div className="ml-8">
          <CommentForm
            onSubmit={async (content) => {
              await createReplyMutation.mutateAsync(content);
            }}
            isSubmitting={createReplyMutation.isPending}
          />
        </div>
      )}

      {comment.replies?.map((reply) => (
        <CommentCard key={reply.id} comment={reply} depth={depth + 1} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {threadedComments.map((comment) => (
        <CommentCard key={comment.id} comment={comment} />
      ))}
    </div>
  );
}