import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Post, User } from "@shared/schema";
import { Trash2, MessageCircle } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPostSchema } from "@shared/schema";
import { z } from "zod";

interface PostCardProps {
  post: Post;
  user: User;
}

// Add comment form type
type CommentForm = z.infer<typeof insertPostSchema>;

export function PostCard({ post, user }: PostCardProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);

  // Add function to check if post can be deleted
  const canDeletePost = () => {
    if (!currentUser || currentUser.id !== post.userId) return false;

    const postDate = new Date(post.createdAt!);
    const today = new Date();
    const isFromPreviousDay = postDate.toDateString() !== today.toDateString();

    // Only allow deleting comments from previous days, or any post type from current day
    return !isFromPreviousDay || post.type === 'comment';
  };

  // Get comments for this post
  const { data: comments } = useQuery<Post[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: () =>
      apiRequest("GET", `/api/posts?parentId=${post.id}&type=comment`)
        .then((res) => res.json()),
    enabled: showComments,
  });

  const form = useForm<CommentForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      points: 1,
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: CommentForm) => {
      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        parentId: post.id,
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
      // Invalidate both posts and user queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.setQueryData(["/api/user"], data.user);
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`} />
            <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{user.username}</p>
            <p className="text-sm text-muted-foreground">{user.points} points</p>
          </div>
        </div>
        {currentUser?.id === post.userId && (
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
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt={post.type}
            className="w-full h-auto object-contain rounded-md mb-4"
          />
        )}
        {post.content && (
          <p className="text-sm">{post.content}</p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">
            {new Date(post.createdAt!).toLocaleDateString()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            {comments?.length || 0} Comments
          </Button>
        </div>

        {showComments && (
          <div className="mt-4 space-y-4">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => addCommentMutation.mutate(data))}
                className="flex items-center gap-2"
              >
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          placeholder="Add a comment..."
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={addCommentMutation.isPending}>
                  {addCommentMutation.isPending ? "Adding..." : "Comment"}
                </Button>
              </form>
            </Form>

            <div className="space-y-2">
              {comments?.map((comment) => (
                <div key={comment.id} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.userId}`} />
                    <AvatarFallback>{comment.userId}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm">{comment.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt!).toLocaleDateString()}
                    </p>
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