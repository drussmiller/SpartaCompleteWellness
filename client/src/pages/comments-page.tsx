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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";

function CommentThread({
  comment,
  depth = 0,
  onReply
}: {
  comment: CommentWithAuthor;
  depth?: number;
  onReply: (parentId: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const maxDepth = 3;

  // Format timestamp to show relative time like "14h", "2d", etc.
  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d`;
    }
    return `${hours}h`;
  };

  return (
    <div className={cn(
      "flex flex-col",
      depth > 0 && "ml-8 pl-4 border-l border-border mt-2"
    )}>
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
          <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="bg-muted/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{comment.author.username}</p>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onReply(comment.id)}
            >
              Reply
            </Button>
            <span className="text-xs text-muted-foreground">
              {getRelativeTime(new Date(comment.createdAt!))}
            </span>
            {comment.replies && comment.replies.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? "Hide replies" : `Show ${comment.replies.length} replies`}
              </Button>
            )}
          </div>
        </div>
      </div>
      {isExpanded && comment.replies && depth < maxDepth && (
        <div className="mt-2">
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
      depth: replyToId ? 1 : 0
    }
  });

  const { data: comments, isLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      try {
        // Get all comments for this post
        const res = await apiRequest("GET", `/api/posts?type=comment&parentId=${postId}`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const comments = await res.json();
        console.log("Fetched comments:", comments); // Debug log
        return comments;
      } catch (error) {
        console.error("Error fetching comments:", error);
        throw error;
      }
    },
    enabled: !!postId && !!currentUser
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      // When replying, update depth based on parent comment's depth
      const parentComment = comments?.find(c => c.id === replyToId);
      const newDepth = parentComment ? parentComment.depth + 1 : 0;

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
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Build comment tree
  const commentTree = comments?.reduce((acc: CommentWithAuthor[], comment) => {
    if (!comment.parentId || comment.parentId === parseInt(postId!)) {
      // Top-level comments
      acc.push({ ...comment, replies: [] });
    } else {
      // Find parent and add reply
      const findParent = (items: CommentWithAuthor[]): boolean => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === comment.parentId) {
            if (!items[i].replies) items[i].replies = [];
            items[i].replies.push({ ...comment, replies: [] });
            return true;
          }
          if (items[i].replies?.length) {
            if (findParent(items[i].replies)) return true;
          }
        }
        return false;
      };
      findParent(acc);
    }
    return acc;
  }, []) || [];

  console.log("Built comment tree:", commentTree); // Debug log

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
        <form onSubmit={form.handleSubmit((data) => addCommentMutation.mutateAsync(data))} className="space-y-4 mb-8">
          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Textarea
                      {...field}
                      placeholder={replyToId ? "Write a reply..." : "Write a comment..."}
                      className="min-h-[100px] pr-20"
                      value={field.value || ''}
                    />
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={addCommentMutation.isPending}>
              {addCommentMutation.isPending ? "Adding..." : (replyToId ? "Reply" : "Comment")}
            </Button>
            {replyToId && (
              <Button variant="ghost" onClick={() => setReplyToId(null)}>
                Cancel Reply
              </Button>
            )}
          </div>
        </form>
      </Form>

      <div className="space-y-6">
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
    </div>
  );
}