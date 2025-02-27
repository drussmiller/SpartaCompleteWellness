
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User } from "@shared/schema";
import { BottomNav } from "@/components/bottom-nav";
import { BackButton } from "@/components/back-button";
import { Loader2, MoreVertical, X, Check, Clipboard } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Drawer, DrawerTrigger, DrawerContent } from "@/components/ui/drawer";
import { useClipboard } from "@/hooks/use-clipboard";

// Define the comment schema
const commentSchema = z.object({
  content: z.string().min(1, { message: "Comment cannot be empty" }),
  parentId: z.number().optional(),
});

// Define the comment type
interface Comment {
  id: number;
  content: string;
  userId: number;
  parentId: number | null;
  createdAt: string;
  type: string;
  depth?: number;
}

interface CommentWithAuthor extends Comment {
  author: User;
  replies?: CommentWithAuthor[];
}

interface Post {
  id: number;
  type: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  userId: number;
}

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const form = useForm<z.infer<typeof commentSchema>>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
      parentId: undefined,
    },
  });

  // Reset form when changes to replyToId or editingComment
  useEffect(() => {
    if (editingComment) {
      form.setValue("content", editingComment.content);
    } else {
      form.setValue("content", "");
    }
  }, [editingComment, form]);

  useEffect(() => {
    // Focus the textarea when we're replying or editing
    if ((replyToId || editingComment) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyToId, editingComment]);

  const { data: comments, isLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts/comments", postId],
    queryFn: async () => {
      if (!postId) return [];
      const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch comments");
      }
      return res.json();
    },
    enabled: !!postId && !!currentUser,
  });

  const { data: post } = useQuery<Post & { author: User }>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      if (!postId) return null;
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch post");
      }
      return res.json();
    },
    enabled: !!postId && !!currentUser,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof commentSchema>) => {
      console.log("Submitting comment with parentId:", data.parentId);
      const res = await apiRequest("POST", "/api/posts", {
        content: data.content,
        parentId: data.parentId || parseInt(postId!),
        type: "comment",
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
      setEditingComment(null);
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

  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const res = await apiRequest("PUT", `/api/comments/${id}`, {
        content,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to edit comment");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      form.reset();
      setEditingComment(null);
      toast({
        title: "Success",
        description: "Comment edited successfully",
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

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete comment");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
      toast({
        title: "Success",
        description: "Comment deleted successfully",
      });
      setDrawerOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof commentSchema>) => {
    // If we're editing, use the edit mutation
    if (editingComment) {
      editCommentMutation.mutate({
        id: editingComment.id,
        content: data.content
      });
    } else {
      addCommentMutation.mutateAsync({
        content: data.content,
        parentId: replyToId || undefined,
      });
    }
  }

  const onReply = (commentId: number) => {
    setReplyToId(commentId);
    setEditingComment(null);
    form.reset();
    
    // Focus the textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleEdit = (comment: Comment) => {
    setEditingComment(comment);
    setReplyToId(null);
    form.setValue("content", comment.content);
    
    // Focus the textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleDelete = (commentId: number) => {
    deleteCommentMutation.mutate(commentId);
  };

  if (!currentUser) {
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

  if (isLoading) {
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
      
      if (comment.parentId && commentMap.has(comment.parentId)) {
        // This is a reply to another comment
        const parentComment = commentMap.get(comment.parentId)!;
        parentComment.replies = parentComment.replies || [];
        parentComment.replies.push(processedComment);
      } else if (comment.parentId && parseInt(postId!) === comment.parentId) {
        // This is a direct reply to the post
        rootComments.push(processedComment);
      }
    });

    return rootComments;
  };

  const commentTree = comments ? buildCommentTree(comments) : [];

  // Recursive component to render comment with its replies
  const CommentThread = ({ comment, depth = 0 }: { comment: CommentWithAuthor, depth?: number }) => {
    const [drawerOpen, setDrawerOpen] = useState(false);

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
          
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-sm">{comment.author.username}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt!).toLocaleString()}
                </p>
              </div>
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
                        className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
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
            <p className="text-sm mt-1 break-words">{comment.content}</p>
          </div>
        </div>
        
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2 border-l-2 border-border">
            {comment.replies.map((reply) => (
              <CommentThread key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pb-32">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4">
          <BackButton />
          <div className="ml-4 text-lg font-semibold">Comments</div>
        </div>
      </header>

      {post && (
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author.username}`} />
              <AvatarFallback>{post.author.username.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{post.author.username}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(post.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          {post.content && (
            <p className="mt-3 text-sm">{post.content}</p>
          )}
          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt={post.type}
              className="w-full h-auto object-contain rounded-md mt-3"
            />
          )}
        </div>
      )}

      <main className="p-4 space-y-4 mb-[150px]">
        {commentTree.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No comments yet</p>
        ) : (
          <div className="space-y-4">
            {commentTree.map((comment) => (
              <CommentThread key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </main>

      <Form {...form} onSubmit={onSubmit}>
        <form className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-10">
          <FormLabel className="text-base">
            {editingComment ? "Edit comment" : replyToId ? "Reply to comment" : "Add a comment"}
          </FormLabel>
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Textarea
                      {...field}
                      ref={textareaRef}
                      placeholder={replyToId ? "Write a reply... (Press Enter to submit)" : "Write a comment... (Press Enter to submit)"}
                      className="min-h-[80px]"
                      value={field.value || ''}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && field.value) {
                          e.preventDefault();
                          form.handleSubmit(onSubmit)();
                        }
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {replyToId && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                Replying to a comment
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReplyToId(null)}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          )}
          {editingComment && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                Editing comment
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditingComment(null)}
              >
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          )}
        </form>
      </Form>

      <BottomNav />
    </div>
  );
}
