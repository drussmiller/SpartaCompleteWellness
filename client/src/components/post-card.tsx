import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User, CommentWithAuthor } from "@shared/schema";
import { MessageCircle, ArrowLeft } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { insertPostSchema } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";


export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const form = useForm<z.infer<typeof insertPostSchema>>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      imageUrl: null,
      points: 0
    },
  });

  const { data: comments, refetch: refetchComments } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts?parentId=${post.id}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isDrawerOpen,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        parentId: post.id,
        type: "comment",
        imageUrl: null
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      form.reset();
      refetchComments();
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

  const onSubmit = (data: z.infer<typeof insertPostSchema>) => {
    addCommentMutation.mutate(data);
  };

  const { data: commentCount } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts?parentId=${post.id}`);
        const comments = await res.json();
        return comments.length;
      } catch (error) {
        console.error("Error fetching comment count:", error);
        return 0;
      }
    },
  });

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
        <Button variant="ghost" size="icon" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
          <MessageCircle className="h-4 w-4" />
        </Button>
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
          <Link href={`/comments/${post.id}`}>
            <Button variant="ghost" size="sm" className="ml-auto">
              <MessageCircle className="h-4 w-4 mr-2" />
              {commentCount || 0} Comments
            </Button>
          </Link>
        </div>
        {isDrawerOpen && (
          <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Comments</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDrawerOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mb-4">
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Write a comment..."
                          className="min-h-[100px]"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="mt-2" disabled={addCommentMutation.isPending}>
                  {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
                </Button>
              </form>
            </Form>
            <div className="flex-1 overflow-y-auto space-y-4">
              {comments?.length === 0 && (
                <p className="text-center text-muted-foreground">No comments yet</p>
              )}
              {comments?.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
                    <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{comment.author.username}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt!).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}