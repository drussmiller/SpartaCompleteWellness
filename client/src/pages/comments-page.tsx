import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Post } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type PostWithAuthor = Post & {
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: PostWithAuthor[];
  depth?: number;
};

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number | null; username: string | null }>({
    id: null,
    username: null,
  });
  const [selectedComment, setSelectedComment] = useState<PostWithAuthor | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");

  const postQuery = useQuery<PostWithAuthor>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch post");
      }
      return res.json();
    },
    enabled: !!postId && !!user,
  });

  const commentsQuery = useQuery<PostWithAuthor[]>({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch comments");
      }
      return res.json();
    },
    enabled: !!postId && !!user,
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: comment.trim(),
        parentId: replyTo.id || Number(postId),
        depth: replyTo.id ? 1 : 0,
        imageUrl: null
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        description: replyTo.id ? "Reply added successfully" : "Comment added successfully"
      });
      setComment("");
      setReplyTo({ id: null, username: null });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to add comment"
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedComment) return;
      const res = await apiRequest("PATCH", `/api/posts/${selectedComment.id}`, {
        content: editedContent.trim()
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to edit comment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Comment updated successfully" });
      setIsEditing(false);
      setIsDrawerOpen(false);
      setSelectedComment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to edit comment"
      });
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedComment) return;
      const res = await apiRequest("DELETE", `/api/posts/${selectedComment.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete comment");
      }
    },
    onSuccess: () => {
      toast({ description: "Comment deleted successfully" });
      setIsDrawerOpen(false);
      setSelectedComment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    addCommentMutation.mutate();
  };

  const handleCommentClick = (comment: PostWithAuthor) => {
    setSelectedComment(comment);
    setEditedContent(comment.content || "");
    setIsDrawerOpen(true);
  };

  const handleCopyComment = () => {
    if (!selectedComment?.content) return;
    navigator.clipboard.writeText(selectedComment.content)
      .then(() => {
        toast({ description: "Comment copied to clipboard" });
        setIsDrawerOpen(false);
      })
      .catch(() => {
        toast({
          variant: "destructive",
          description: "Failed to copy comment"
        });
      });
  };

  const renderComment = (comment: PostWithAuthor, depth = 0) => (
    <div
      key={comment.id}
      className={`flex flex-col space-y-2 ${depth > 0 ? 'ml-8 pl-4 border-l border-border' : ''}`}
    >
      <div className="flex items-start space-x-3">
        <Avatar className="h-8 w-8">
          <AvatarImage
            src={comment.author?.imageUrl || undefined}
            alt={comment.author?.username || ''}
          />
          <AvatarFallback>
            {comment.author?.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div
            className="rounded-lg bg-muted/25 p-3 border-[1.5px] border-border/75 shadow-sm cursor-pointer hover:bg-muted/30"
            onClick={() => handleCommentClick(comment)}
          >
            <span className="font-semibold">{comment.author?.username}</span>
            <p className="text-sm mt-1">{comment.content}</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              className="h-8 px-4 bg-background hover:bg-background/90"
            >
              Like
            </Button>
            <Button
              size="sm"
              className="h-8 px-4 bg-background hover:bg-background/90"
              onClick={(e) => {
                e.stopPropagation();
                setReplyTo({
                  id: comment.id,
                  username: comment.author?.username || null
                });
              }}
            >
              Reply
            </Button>
          </div>
        </div>
      </div>
      {comment.replies?.map(reply => renderComment(reply, depth + 1))}
    </div>
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-lg text-muted-foreground">Please log in to view comments</p>
      </div>
    );
  }

  if (!postId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-lg text-muted-foreground">Invalid post ID</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="container max-w-2xl mx-auto flex-1 pb-24 bg-white">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              className="mr-2"
            >
              &lt;
            </Button>
            <h1 className="font-bold text-xl inline-block">Comments</h1>
          </div>
        </header>

        {postQuery.isLoading ? (
          <div className="flex justify-center p-4 bg-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : postQuery.error ? (
          <div className="p-4 text-destructive bg-white">
            {postQuery.error instanceof Error ? postQuery.error.message : 'Failed to load post'}
          </div>
        ) : postQuery.data ? (
          <div className="mb-6 bg-white">
            <div className="flex items-start space-x-3 p-4 bg-white">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={postQuery.data.author?.imageUrl || undefined}
                  alt={postQuery.data.author?.username || ''}
                />
                <AvatarFallback>
                  {postQuery.data.author?.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="rounded-lg bg-muted/25 p-3 border-[1.5px] border-border/75 shadow-sm">
                  <div className="font-semibold">{postQuery.data.author?.username}</div>
                  <p className="mt-1">{postQuery.data.content}</p>
                </div>
              </div>
            </div>
            {postQuery.data.imageUrl && (
              <img
                src={postQuery.data.imageUrl}
                alt="Post image"
                className="w-full object-contain max-h-[70vh]"
              />
            )}
          </div>
        ) : null}

        <div className="divide-y divide-border bg-white">
          <h2 className="font-semibold text-lg p-4">Comments</h2>

          {commentsQuery.isLoading ? (
            <div className="flex justify-center p-4 bg-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : commentsQuery.error ? (
            <div className="text-destructive p-4 bg-white">
              Error loading comments: {commentsQuery.error instanceof Error ? commentsQuery.error.message : 'Unknown error'}
            </div>
          ) : commentsQuery.data?.length === 0 ? (
            <div className="text-center text-muted-foreground p-4 bg-white">No comments yet. Be the first to comment!</div>
          ) : (
            <div className="space-y-6 p-4 bg-white">
              {commentsQuery.data?.map(comment => renderComment(comment))}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="container max-w-2xl mx-auto">
          {replyTo.id && (
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-muted-foreground">
                Replying to <span className="font-medium">{replyTo.username}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyTo({ id: null, username: null })}
              >
                Cancel
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage
                src={user.imageUrl || undefined}
                alt={user.username}
              />
              <AvatarFallback>
                {user.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={replyTo.id ? "Write a reply..." : "Add a comment..."}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={!comment.trim() || addCommentMutation.isPending}
              size="icon"
            >
              {addCommentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>

      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-2xl">
            <DrawerHeader>
              <DrawerTitle>
                {isEditing ? "Edit Comment" : "Comment Options"}
              </DrawerTitle>
            </DrawerHeader>
            {isEditing ? (
              <div className="p-4">
                <Input
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="mb-4"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => editCommentMutation.mutate()}
                    disabled={!editedContent.trim() || editCommentMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <Button
                  className="w-full justify-start h-12"
                  variant="ghost"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    if (selectedComment) {
                      setReplyTo({
                        id: selectedComment.id,
                        username: selectedComment.author?.username || null
                      });
                    }
                  }}
                >
                  Reply
                </Button>
                {selectedComment?.author?.id === user.id && (
                  <>
                    <Button
                      className="w-full justify-start h-12"
                      variant="ghost"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </Button>
                    <Button
                      className="w-full justify-start h-12 text-destructive hover:text-destructive"
                      variant="ghost"
                      onClick={() => deleteCommentMutation.mutate()}
                    >
                      Delete
                    </Button>
                  </>
                )}
                <Button
                  className="w-full justify-start h-12"
                  variant="ghost"
                  onClick={handleCopyComment}
                >
                  Copy
                </Button>
                <DrawerFooter className="p-0">
                  <DrawerClose asChild>
                    <Button
                      className="w-full justify-start h-12"
                      variant="ghost"
                    >
                      Close
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}