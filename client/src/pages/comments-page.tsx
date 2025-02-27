import { z } from "zod";
import { useParams } from "wouter";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { insertPostSchema, Post, User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, Trash2, Reply } from "lucide-react";


function CommentThread({
  comment,
  depth = 0,
  onReply,
}: {
  comment: CommentWithAuthor;
  depth?: number;
  onReply: (commentId: number) => void;
}) {
  const maxDepth = 5;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={`border-l-2 pl-4 py-3 mb-4 ${depth > 0 ? "ml-4" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div 
            className="bg-muted/50 rounded-lg px-3 py-2 relative cursor-pointer active:bg-muted"
            onClick={handleCommentClick}
            onContextMenu={(e) => {
              e.preventDefault();
              setDrawerOpen(true);
            }}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{comment.author.username}</p>
              <span className="text-xs text-muted-foreground">•</span>
              <p className="text-xs text-muted-foreground">
                {new Date(comment.createdAt!).toLocaleDateString()}
              </p>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
          </div>
          {/* Comment interaction drawer */}
          <CommentActionDrawer 
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onReply={() => onReply(comment.id)}
            onDelete={() => deleteCommentMutation.mutate()}
            onCopy={handleCopyComment}
            canDelete={currentUser?.id === comment.userId}
            commentId={comment.id}
            commentContent={comment.content || ''}
          />
        </div>
      </div>

      {depth < maxDepth && comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentsPage() {
  const { postId } = useParams();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [replyToId, setReplyToId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof insertPostSchema>>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      imageUrl: null,
      points: 1,
      parentId: parseInt(postId!),
      depth: 0
    }
  });

  // Modified query to fetch all comments related to this post
  const { data: comments, isLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      try {
        // Modified query to fetch all comments in the thread
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const comments = await res.json();
        console.log("Raw comments from API:", comments);
        return comments;
      } catch (error) {
        console.error("Error fetching comments:", error);
        throw error;
      }
    },
    enabled: !!postId && !!currentUser
  });

  const { data: originalPost, isLoading: isOriginalPostLoading } = useQuery<Post>({
    queryKey: ["/api/posts", postId],
    queryFn: () => apiRequest("GET", `/api/posts/${postId}`).then(res => res.json()),
    enabled: !!postId
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      console.log("Adding new comment/reply:", {
        replyToId,
        data,
        parentComment: replyToId ? comments?.find(c => c.id === replyToId) : null
      });

      const parentComment = replyToId ? comments?.find(c => c.id === replyToId) : null;
      const newDepth = parentComment ? (parentComment.depth || 0) + 1 : 0;

      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        type: "comment",
        parentId: replyToId || parseInt(postId!),
        points: 1,
        depth: newDepth
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      form.reset();
      setReplyToId(null);
      toast({
        title: "Success",
        description: "Comment added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please log in to view comments</p>
          <Link href="/auth">
            <Button>Log In</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || isOriginalPostLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Build comment tree based on parent-child relationships
  const buildCommentTree = (comments: CommentWithAuthor[]): CommentWithAuthor[] => {
    // First, create a map of comments by their IDs
    const commentMap = new Map<number, CommentWithAuthor>();
    const rootComments: CommentWithAuthor[] = [];

    // Initialize the map with all comments
    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Build the tree structure
    comments.forEach(comment => {
      const processedComment = commentMap.get(comment.id)!;

      // If it's a reply to another comment
      if (comment.parentId && comment.parentId !== parseInt(postId!)) {
        const parentComment = commentMap.get(comment.parentId);
        if (parentComment) {
          if (!parentComment.replies) parentComment.replies = [];
          parentComment.replies.push(processedComment);
        }
      } else {
        // It's a top-level comment
        rootComments.push(processedComment);
      }
    });

    console.log("Root comments:", rootComments);
    rootComments.forEach(comment => {
      console.log(`Comment ${comment.id} has ${comment.replies?.length || 0} replies`);
    });

    return rootComments;
  };

  const commentTree = buildCommentTree(comments || []);

  return (
    <div className="container max-w-3xl mx-auto py-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Comments</h1>
      </div>

      {originalPost && (
        <div className="mb-8 border rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-4 mb-4">
            <Avatar>
              <AvatarImage src={originalPost.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${originalPost.author?.username}`} />
              <AvatarFallback>{originalPost.author?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{originalPost.author?.username}</p>
              <p className="text-sm text-muted-foreground">{originalPost.author?.points || 0} points</p>
            </div>
          </div>

          {originalPost.content && (
            <p className="text-sm mb-4 whitespace-pre-wrap">{originalPost.content}</p>
          )}
          {originalPost.imageUrl && (
            <img
              src={originalPost.imageUrl}
              alt={originalPost.type}
              className="w-full h-auto object-contain rounded-md mb-4"
            />
          )}

          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{originalPost.type.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {new Date(originalPost.createdAt!).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-6 pb-32">
        {commentTree.map((comment) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            onReply={setReplyToId}
          />
        ))}
        {!comments?.length && (
          <p className="text-center text-muted-foreground">No comments yet</p>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => addCommentMutation.mutateAsync(data))} className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-10">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Textarea
                      {...field}
                      placeholder={replyToId ? "Write a reply... (Press Enter to submit)" : "Write a comment... (Press Enter to submit)"}
                      className="min-h-[80px] pr-20"
                      value={field.value || ''}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          form.handleSubmit((data) => addCommentMutation.mutateAsync(data))();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        field.onChange(field.value + "😊");
                      }}
                      className="absolute right-2 bottom-2 p-2 text-muted-foreground hover:text-foreground"
                    >
                      😊
                    </button>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
          {replyToId && (
            <Button variant="ghost" onClick={() => setReplyToId(null)}>
              Cancel Reply
            </Button>
          )}
        </form>
      </Form>
    </div>
  );
}

// Add CommentActionDrawer component at the bottom of the file
function CommentActionDrawer({
  isOpen,
  onClose,
  onReply,
  onDelete,
  onCopy,
  canDelete,
  commentId,
  commentContent
}: {
  isOpen: boolean;
  onClose: () => void;
  onReply: () => void;
  onDelete: () => void;
  onCopy: () => void;
  canDelete: boolean;
  commentId: number;
  commentContent: string;
}) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { postId } = useParams();
  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText ? JSON.parse(errorText).message : "Failed to delete comment");
      }
      return res;
    },
    onMutate: async () => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/posts/comments", postId] });

      // Get the current comments
      const previousComments = queryClient.getQueryData(["/api/posts/comments", postId]);

      // Return context with the previous comments
      return { previousComments };
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Comment deleted successfully" });
      // Force refetch to ensure we have the latest data
      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/comments", postId],
        exact: true,
        refetchType: 'all'
      });
      onClose();
    },
    onError: (error: Error, _, context) => {
      // Revert to the previous comments on error
      if (context?.previousComments) {
        queryClient.setQueryData(["/api/posts/comments", postId], context.previousComments);
      }
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete comment", 
        variant: "destructive" 
      });
      onClose();
    }
  });

  const handleCopyComment = () => {
    navigator.clipboard.writeText(commentContent).then(() => {
      toast({ title: "Success", description: "Comment copied to clipboard" });
    }, (err) => {
      toast({ title: "Error", description: "Failed to copy comment", variant: "destructive" });
    });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 z-50"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`fixed bottom-0 left-0 right-0 bg-card rounded-t-xl shadow-lg transition-transform duration-300 ease-in-out z-50 ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="p-4 space-y-4">
          <div className="w-12 h-1 bg-muted mx-auto rounded-full mb-4" />

          <button 
            onClick={() => {
              onReply();
              onClose();
            }}
            className="flex items-center justify-center gap-3 w-full p-3 text-center hover:bg-accent rounded-md text-2xl font-medium"
          >
            <Reply className="h-5 w-5" />
            <span>Reply</span>
          </button>

          <button 
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="flex items-center justify-center gap-3 w-full p-3 text-center hover:bg-accent rounded-md text-2xl font-medium"
          >
            <Copy className="h-5 w-5" />
            <span>Copy Text</span>
          </button>

          {canDelete && (
            <button 
              onClick={() => {
                onDelete();
                // Don't close manually - let the mutation handler close it
                // to prevent potential race conditions
              }}
              className="flex items-center justify-center gap-3 w-full p-3 text-center text-destructive hover:bg-destructive/10 rounded-md text-2xl font-medium"
            >
              <Trash2 className="h-5 w-5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}