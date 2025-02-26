import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema, type CommentWithAuthor } from "@shared/schema";
import { z } from "zod";
import { useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker from 'emoji-picker-react';
import { Link } from "wouter";
import React from 'react';
import { Loader2 } from "lucide-react";

function CommentThread({
  comment,
  postAuthorId,
  currentUser,
  onReply,
  depth = 0
}: {
  comment: CommentWithAuthor;
  postAuthorId: number;
  currentUser: any;
  onReply: (parentId: number) => void;
  depth?: number;
}) {
  const isAuthor = comment.userId === postAuthorId;
  const maxDepth = 3;

  return (
    <div className={cn(
      "flex flex-col gap-4",
      depth > 0 && "ml-8 pl-4 border-l border-border"
    )}>
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                {comment.author.username}
                {isAuthor && (
                  <span className="ml-2 text-xs bg-primary/20 px-1.5 py-0.5 rounded-full">
                    Author
                  </span>
                )}
              </p>
              <span className="text-muted-foreground">•</span>
              <p className="text-xs text-muted-foreground">
                {new Date(comment.createdAt!).toLocaleDateString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <p className="text-sm mt-1">{comment.content}</p>
          </div>
          {depth < maxDepth && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 text-xs text-muted-foreground hover:text-foreground"
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

export default function CommentsPage() {
  const { postId } = useParams();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const form = useForm<z.infer<typeof insertPostSchema>>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      imageUrl: null,
      points: 1,
      parentId: null
    }
  });

  const { data: comments, isLoading, refetch: refetchComments } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/${postId}/comments`);
        if (!res.ok) {
          throw new Error("Failed to fetch comments");
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching comments:", error);
        toast({
          title: "Error",
          description: "Failed to load comments",
          variant: "destructive",
        });
        return [];
      }
    },
  });

  const commentTree = useMemo(() => {
    if (!comments) return [];

    const commentMap = new Map<number, CommentWithAuthor>();
    const roots: CommentWithAuthor[] = [];

    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    comments.forEach(comment => {
      if (comment.parentId === parseInt(postId!)) {
        roots.push(commentMap.get(comment.id)!);
      } else if (comment.parentId && commentMap.has(comment.parentId)) {
        const parent = commentMap.get(comment.parentId)!;
        if (!parent.replies) parent.replies = [];
        parent.replies.push(commentMap.get(comment.id)!);
      }
    });

    return roots;
  }, [comments, postId]);

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      const parentId = replyToId || parseInt(postId!);

      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        type: "comment",
        parentId,
        points: 1,
        imageUrl: null
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || error.error || 'Failed to create comment');
      }
      return res.json();
    },
    onSuccess: async () => {
      await refetchComments();
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      form.reset();
      setReplyToId(null);
      setShowEmojiPicker(false);
      toast({
        title: "Success",
        description: "Comment added successfully!",
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

  const handleSubmit = async (data: z.infer<typeof insertPostSchema>) => {
    await addCommentMutation.mutateAsync({
      ...data,
      parentId: replyToId || parseInt(postId!)
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const formData = form.getValues();
      handleSubmit(formData);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mb-8">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem className="relative">
                <FormControl>
                  <div className="relative">
                    <Textarea
                      {...field}
                      placeholder={replyToId ? "Write a reply..." : "Write a comment..."}
                      value={field.value || ''}
                      onKeyDown={handleKeyPress}
                      className="min-h-[100px] resize-none"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowEmojiPicker(!showEmojiPicker);
                      }}
                    >
                      😊
                    </Button>
                  </div>
                </FormControl>
                {showEmojiPicker && (
                  <div className="absolute top-full right-0 z-50">
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
          {replyToId && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => setReplyToId(null)}
            >
              Cancel Reply
            </Button>
          )}
          <Button type="submit" disabled={addCommentMutation.isPending}>
            {addCommentMutation.isPending ? "Adding..." : (replyToId ? "Reply" : "Comment")}
          </Button>
        </form>
      </Form>

      <div className="space-y-4">
        {comments && comments.length > 0 ? (
          commentTree.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              postAuthorId={parseInt(postId!)}
              currentUser={currentUser!}
              onReply={setReplyToId}
            />
          ))
        ) : (
          <p className="text-center text-muted-foreground">No comments yet</p>
        )}
      </div>
    </div>
  );
}