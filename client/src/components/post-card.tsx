import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Post, User, CommentWithAuthor } from "@shared/schema";
import { Trash2, MessageCircle, ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema } from "@shared/schema";
import { z } from "zod";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";
import EmojiPicker from 'emoji-picker-react';

function CommentThread({
  comment,
  postAuthorId,
  currentUser,
  onReply,
  depth = 0
}: {
  comment: CommentWithAuthor;
  postAuthorId: number;
  currentUser: User;
  onReply: (parentId: number) => void;
  depth?: number;
}) {
  const isAuthor = comment.userId === postAuthorId;
  const maxDepth = 3; // Maximum nesting level

  return (
    <div className={cn(
      "flex flex-col gap-4",
      depth > 0 && "ml-6 pl-4 border-l border-border"
    )}>
      <div className={cn(
        "flex items-start gap-3 p-3 rounded-lg",
        isAuthor ? "bg-primary/10" : "bg-muted/50"
      )}>
        <Avatar className="h-6 w-6">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {comment.author.username}
              {isAuthor && (
                <span className="ml-2 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                  Author
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(comment.createdAt!).toLocaleDateString()}
            </p>
          </div>
          <p className="text-sm mt-1">{comment.content}</p>
          {depth < maxDepth && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onReply(comment.id)}
            >
              Reply
            </Button>
          )}
        </div>
      </div>
      {comment.replies?.map((reply) => (
        <CommentThread
          key={reply.id}
          comment={reply}
          postAuthorId={postAuthorId}
          currentUser={currentUser}
          onReply={onReply}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const form = useForm<z.infer<typeof insertPostSchema>>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      points: 0,
    },
  });

  const { data: comments, error } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      console.log('Fetching comments for post:', post.id);
      try {
        const res = await apiRequest("GET", `/api/posts?parentId=${post.id}`);
        const data = await res.json();
        console.log('Comments received:', data);
        return data;
      } catch (error) {
        console.error("Error fetching comments:", error);
        toast({
          title: "Error",
          description: "Failed to load comments",
          variant: "destructive",
        });
        return []; // Return empty array on error
      }
    },
    enabled: isDrawerOpen,
  });

  const commentTree = useMemo(() => {
    if (!comments) return [];
    console.log('Building comment tree from:', comments);

    const commentMap = new Map<number, CommentWithAuthor>();
    const roots: CommentWithAuthor[] = [];

    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    comments.forEach(comment => {
      if (comment.parentId === post.id) {
        roots.push(commentMap.get(comment.id)!);
      } else if (comment.parentId && commentMap.has(comment.parentId)) {
        const parent = commentMap.get(comment.parentId)!;
        if (!parent.replies) parent.replies = [];
        parent.replies.push(commentMap.get(comment.id)!);
      }
    });

    console.log('Generated comment tree:', roots);
    return roots;
  }, [comments, post.id]);

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        parentId: replyToId || post.id,
        depth: replyToId ? 1 : 0,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
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

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${post.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete post");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });

      if (data.user) {
        queryClient.setQueryData(["/api/user"], data.user);
      }

      toast({
        title: "Success",
        description: "Post deleted successfully",
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

  const canDeletePost = () => {
    if (!currentUser || currentUser.id !== post.userId) return false;

    const postDate = new Date(post.createdAt!);
    const today = new Date();
    const isFromPreviousDay = postDate.toDateString() !== today.toDateString();

    return !isFromPreviousDay || post.type === 'comment';
  };

  const onSubmit = (data: z.infer<typeof insertPostSchema>) => {
    console.log('Submitting form with data:', data);
    addCommentMutation.mutate(data);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.handleSubmit(onSubmit)();
    }
  };

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
        {currentUser?.id === post.userId && canDeletePost() && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => deletePostMutation.mutate()}
            disabled={deletePostMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
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
          <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  console.log('Opening comments drawer');
                  setIsDrawerOpen(!isDrawerOpen);
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {comments?.length || 0} Comments
              </Button>

              <div className={cn(
                "fixed inset-y-0 right-0 w-[400px] bg-background border-l shadow-lg transform transition-transform duration-300 ease-in-out z-50",
                isDrawerOpen ? "translate-x-0" : "translate-x-full"
              )}>
                <div className="h-full flex flex-col p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Comments</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDrawerOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="content"
                          render={({ field }) => (
                            <FormItem className="relative">
                              <FormControl>
                                <div className="relative">
                                  <textarea
                                    className="w-full min-h-[60px] px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder={replyToId ? "Write a reply..." : "Add a comment... (Press Enter to send)"}
                                    {...field}
                                    value={field.value || ""}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        form.handleSubmit(onSubmit)();
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-2 top-2"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setShowEmojiPicker(!showEmojiPicker);
                                    }}
                                  >
                                    😊
                                  </Button>
                                </div>
                              </FormControl>
                              {showEmojiPicker && (
                                <div className="absolute top-full left-0 z-50">
                                  <EmojiPicker
                                    onEmojiClick={(emojiData) => {
                                      field.onChange((field.value || '') + emojiData.emoji);
                                      setShowEmojiPicker(false);
                                    }}
                                  />
                                </div>
                              )}
                            </FormItem>
                          )}
                        />
                      </form>
                    </Form>

                    <div className="space-y-4 mt-6">
                      {comments && comments.length > 0 ? (
                        commentTree.map((comment) => (
                          <CommentThread
                            key={comment.id}
                            comment={comment}
                            postAuthorId={post.userId}
                            currentUser={currentUser!}
                            onReply={setReplyToId}
                          />
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground">No comments yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}