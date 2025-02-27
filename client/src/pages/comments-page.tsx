import { useState, useRef, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { insertPostSchema, Post, User } from "@shared/schema";
import * as z from "zod";
import { queryClient } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormLabel
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  SendHorizontal,
  MoreVertical,
  Pencil,
  Trash2,
  Copy
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface CommentWithAuthor extends Post {
  author: User;
  replies?: CommentWithAuthor[];
}

function CommentThread({
  comment,
  depth = 0,
  onReply,
}: {
  comment: CommentWithAuthor;
  depth?: number;
  onReply: (parentId: number) => void;
}) {
  const maxDepth = 3;
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { postId } = useParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const deleteCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/comments/${comment.id}`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText ? JSON.parse(errorText).message : "Failed to delete comment");
      }
      return res;
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

  const canEdit = (comment: any) => {
    return currentUser?.id === comment.userId;
  };

  const canDelete = (comment: any) => {
    return currentUser?.id === comment.userId || currentUser?.isAdmin;
  };

  const handleEdit = (comment: any) => {
    //This function will be implemented in the parent component.
  };

  const handleDelete = (commentId: number) => {
    //This function will be implemented in the parent component.
  };

  return (
    <div className={`pl-${depth > 0 ? 4 : 0}`}>
      <div className="flex items-start gap-3 p-3 rounded-lg border">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium leading-none">
              {comment.author.username}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {new Date(comment.createdAt!).toLocaleString()}
              </p>
              {(currentUser?.id === comment.userId || currentUser?.isAdmin) && (
                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="p-0">
                    <div className="flex flex-col divide-y divide-border">
                      <Button 
                        variant="ghost" 
                        className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
                        onClick={() => onReply(comment.id)}
                      >
                        Reply
                      </Button>
                      {canEdit && (
                        <Button 
                          variant="ghost" 
                          className="justify-center rounded-none py-6 text-blue-500 text-base font-normal"
                          onClick={() => handleEdit(comment)}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button 
                          variant="ghost" 
                          className="justify-center rounded-none py-6 text-red-500 text-base font-normal"
                          onClick={() => handleDelete(comment.id)}
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
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <div className="mt-2 border-t border-border">
                      <DrawerClose asChild>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-center rounded-none py-6 text-blue-500 text-base font-normal"
                        >
                          Cancel
                        </Button>
                      </DrawerClose>
                    </div>
                    <div className="h-1.5 w-full flex justify-center items-center pt-2 pb-4">
                      <div className="h-1 w-10 bg-gray-300 rounded-full"></div>
                    </div>
                  </DrawerContent>
                </Drawer>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {comment.content}
          </p>
          {/* Removed Reply button */}
        </div>
      </div>

      {depth < maxDepth && comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2 ml-4 mt-2">
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
  const [editingComment, setEditingComment] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea when reply is initiated or editing starts
  useEffect(() => {
    if ((replyToId || editingComment) && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyToId, editingComment]);

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
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      console.log("Submitting comment with parentId:", replyToId);
      const commentData = {
        ...data,
        parentId: replyToId || parseInt(postId!),
      };
      const res = await apiRequest("POST", "/api/posts", commentData);
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
    mutationFn: async (data: { id: number; content: string }) => {
      const response = await apiRequest('PATCH', `/api/posts/${data.id}`, {
        content: data.content
      });
      return response.json();
    },
    onSuccess: () => {
      form.reset();
      setEditingComment(null);
      queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });
      toast({
        title: "Success",
        description: "Comment updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update comment",
        variant: "destructive",
      });
    }
  });

  const handleEdit = (comment: any) => {
    setEditingComment(comment);
    form.setValue("content", comment.content);
  };

  const handleDelete = (commentId: number) => {
    deleteCommentMutation.mutate();
  };

  const canEdit = (comment: any) => {
    return currentUser?.id === comment.userId;
  };

  const canDelete = (comment: any) => {
    return currentUser?.id === comment.userId || currentUser?.isAdmin;
  };

  const onReply = (commentId: number) => {
    setReplyToId(commentId);
    setEditingComment(null);
  };

  function onSubmit(data: z.infer<typeof insertPostSchema>) {
    if (!data.content.trim()) return;

    if (editingComment) {
      editCommentMutation.mutate({
        id: editingComment.id,
        content: data.content
      });
    } else {
      addCommentMutation.mutateAsync(data);
    }
  }

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

    return rootComments;
  };

  const commentTree = buildCommentTree(comments || []);

  return (
    <div className="container max-w-3xl mx-auto py-6 pb-32">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Comments</h1>
      </div>

      {post && (
        <div className="mb-6 p-4 border rounded-lg">
          <div className="flex items-center gap-4 mb-3">
            <Avatar>
              <AvatarImage src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} />
              <AvatarFallback>{post.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{post.author?.username}</p>
              <p className="text-xs text-muted-foreground">{new Date(post.createdAt!).toLocaleString()}</p>
            </div>
          </div>
          <p className="whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && (
            <img 
              src={post.imageUrl} 
              alt="Post image" 
              className="w-full h-auto rounded-md mt-3 max-h-96 object-contain" 
            />
          )}
        </div>
      )}

      <div className="space-y-6 mb-24 px-2">
        {commentTree.map((comment) => (
          <CommentThread
            key={comment.id}
            comment={comment}
            onReply={onReply}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
          />
        ))}
        {!comments?.length && (
          <p className="text-center text-muted-foreground">No comments yet</p>
        )}
      </div>

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
                Cancel
              </Button>
            </div>
          )}
          <Button type="submit" className="mt-4">Submit</Button>
        </form>
      </Form>
    </div>
  );
}