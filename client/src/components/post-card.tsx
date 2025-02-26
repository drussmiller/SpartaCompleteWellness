import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MessageCircle, ChevronLeft, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CommentWithAuthor } from "@shared/schema";

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentContent, setCommentContent] = useState("");

  const { data: commentCount } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        if (!post.id) return 0;
        const res = await apiRequest("GET", `/api/posts?parentId=${post.id}&type=comment`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const comments = await res.json();
        return Array.isArray(comments) ? comments.length : 0;
      } catch (error) {
        console.error("Error fetching comment count:", error);
        return 0;
      }
    },
  });

  const { data: comments } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts?parentId=${post.id}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isCommentsOpen
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content,
        parentId: post.id,
        points: 0
      });
      if (!res.ok) throw new Error("Failed to add comment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comment-count"] });
      setCommentContent("");
    }
  });

  const handleSubmitComment = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && commentContent.trim()) {
      e.preventDefault();
      addCommentMutation.mutate(commentContent);
    }
  };

  const CommentItem = ({ comment }: { comment: CommentWithAuthor }) => (
    <div className="flex items-start gap-3 pl-4 border-l border-border">
      <Avatar className="h-6 w-6">
        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
        <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{comment.author.username}</p>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.createdAt!).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${post.author.username}`} />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{post.author.username}</p>
            <p className="text-sm text-muted-foreground">{post.author.points} points</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {post.content && (
          <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt={post.type}
            className="w-full h-auto object-contain rounded-md mb-4"
          />
        )}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">
            {new Date(post.createdAt!).toLocaleDateString()}
          </span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setIsCommentsOpen(true)}>
            <MessageCircle className="h-4 w-4" />
            {commentCount || 0}
          </Button>
        </div>
      </CardContent>

      <Sheet open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setIsCommentsOpen(false)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <SheetTitle>Comments</SheetTitle>
            </div>
          </SheetHeader>
          
          <div className="flex flex-col h-[calc(100vh-8rem)]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {comments?.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
              {!comments?.length && (
                <p className="text-center text-muted-foreground">No comments yet</p>
              )}
            </div>
            
            <div className="border-t p-4">
              <Textarea
                placeholder="Write a comment..."
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                onKeyDown={handleSubmitComment}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}