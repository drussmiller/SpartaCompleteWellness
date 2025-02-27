import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { useParams } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/bottom-nav";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { useClipboard } from "@/hooks/use-clipboard";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

type Comment = {
  id: number;
  content: string;
  parentId: number | null;
  userId: number;
  createdAt: string;
  depth: number;
  author: {
    id: number;
    username: string;
    imageUrl: string | null;
  };
};

type CommentThreadProps = {
  comment: Comment;
  depth: number;
  onReply: (parentId: number) => void;
  onRefresh: () => void;
};

function CommentThread({ comment, depth, onReply, onRefresh }: CommentThreadProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { copy } = useClipboard();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleDelete = async (commentId: number) => {
    try {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
      onRefresh();
      toast({
        description: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast({
        variant: "destructive",
        description: "Failed to delete comment",
      });
    }
  };

  const handleEdit = (comment: Comment) => {
    //This function will be implemented in the parent component.
  };

  const handleCommentClick = () => {
    setDrawerOpen(true);
  };

  return (
    <div className={`pl-${depth > 0 ? 4 : 0}`}>
      <div 
        className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer"
        onClick={handleCommentClick}
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="font-medium">{comment.author.username}</div>
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">
                {new Date(comment.createdAt!).toLocaleString()}
              </p>
              <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
                <DrawerTrigger asChild>
                  <div className="hidden">
                    {/* Hidden trigger, we'll control the drawer with our own click handler */}
                  </div>
                </DrawerTrigger>
                <DrawerContent className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      <Button 
                        variant="ghost" 
                        className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
                        onClick={() => {
                          onReply(comment.id);
                          setDrawerOpen(false);
                        }}
                      >
                        Reply
                      </Button>
                      {(currentUser?.id === comment.userId || currentUser?.isAdmin) && (
                        <Button 
                          variant="ghost" 
                          className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
                          onClick={() => {
                            handleEdit(comment);
                            setDrawerOpen(false);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {(currentUser?.id === comment.userId || currentUser?.isAdmin) && (
                        <Button 
                          variant="ghost" 
                          className="justify-center rounded-none py-6 text-red-500 text-base font-normal"
                          onClick={() => {
                            handleDelete(comment.id);
                            // Drawer will be closed by the delete mutation success handler
                          }}
                        >
                          Delete
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="justify-center rounded-none py-6 text-base font-normal"
                        onClick={() => {
                          navigator.clipboard.writeText(comment.content);
                          toast({ description: "Comment copied to clipboard" });
                          setDrawerOpen(false);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
        </div>
      </div>
    </div>
  );
}

export default function CommentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useParams();
  const postId = params.postId ? parseInt(params.postId) : null;
  const [location, setLocation] = useLocation();

  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: originalPost, isLoading: isPostLoading } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    enabled: !!postId,
  });

  const { data: comments = [], isLoading: areCommentsLoading, refetch } = useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    enabled: !!postId,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId: number | null }) => {
      console.log("Submitting comment with parentId:", data.parentId);
      const response = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: data.content,
        parentId: data.parentId || postId,
      });
      return response.json();
    },
    onSuccess: () => {
      setComment("");
      refetch();
      toast({
        description: "Comment posted successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        description: "Failed to post comment",
      });
      console.error("Error posting comment:", error);
    },
  });

  const handleSubmitComment = () => {
    if (!comment.trim()) return;

    createCommentMutation.mutate({
      content: comment,
      parentId: replyTo,
    });

    // Reset reply state
    setReplyTo(null);
  };

  const handleReply = (parentId: number) => {
    setReplyTo(parentId);
    if (commentInputRef.current) {
      commentInputRef.current.focus();
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  useEffect(() => {
    if (replyTo && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [replyTo]);

  const renderComments = (commentList: Comment[], parentId: number | null = null, level = 0) => {
    return commentList
      .filter(c => c.parentId === parentId)
      .map(comment => (
        <div key={comment.id} className="mt-3">
          <CommentThread
            comment={comment}
            depth={level}
            onReply={handleReply}
            onRefresh={refetch}
          />
          {renderComments(commentList, comment.id, level + 1)}
        </div>
      ));
  };

  if (isPostLoading || areCommentsLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please log in to view comments</p>
          <Link to="/auth">
            <Button>Log In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            className="mr-2"
          >
            &larr;
          </Button>
          <h1 className="text-xl font-bold truncate">Comments</h1>
        </div>
      </header>

      <main className="p-4">
        {originalPost && (
          <div className="mb-6 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={originalPost.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author.username}`} />
                <AvatarFallback>{originalPost.author.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{originalPost.author.username}</div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(originalPost.createdAt).toLocaleString()}
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
        )}

        <div className="sticky bottom-20 z-10 bg-background pt-2">
          <div className="flex flex-col mb-2">
            <Textarea
              ref={commentInputRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleCommentKeyDown}
              placeholder={replyTo ? "Write your reply..." : "Write a comment..."}
              className="resize-none"
            />
            {replyTo && (
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  Replying to comment #{replyTo}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto py-0 px-1"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            renderComments(comments)
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}