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
import { Drawer } from "vaul";

interface PostCardProps {
  post: Post;
  user: User;
}

type CommentForm = z.infer<typeof insertPostSchema>;

export function PostCard({ post, user }: PostCardProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);

  const canDeletePost = () => {
    if (!currentUser || currentUser.id !== post.userId) return false;

    const postDate = new Date(post.createdAt!);
    const today = new Date();
    const isFromPreviousDay = postDate.toDateString() !== today.toDateString();

    return !isFromPreviousDay || post.type === 'comment';
  };

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
          <Drawer.Root open={showComments} onOpenChange={setShowComments}>
            <Drawer.Trigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {comments?.length || 0} Comments
              </Button>
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-black/40" />
              <Drawer.Content className="bg-background flex flex-col rounded-t-[10px] h-[80vh] mt-24 fixed bottom-0 left-0 right-0">
                <div className="p-4 rounded-t-[10px] flex-1 overflow-y-auto">
                  <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-semibold">Comments</h2>
                      <Drawer.Close asChild>
                        <Button variant="ghost" size="sm">Close</Button>
                      </Drawer.Close>
                    </div>

                    {/* Original Post */}
                    <Card className="mb-6">
                      <CardHeader className="flex flex-row items-center p-4">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`} />
                          <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="ml-3">
                          <p className="text-sm font-semibold">{user.username}</p>
                          <p className="text-xs text-muted-foreground">{new Date(post.createdAt!).toLocaleDateString()}</p>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        {post.content && (
                          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                        )}
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt={post.type}
                            className="w-full h-auto object-contain rounded-md mt-2"
                          />
                        )}
                      </CardContent>
                    </Card>

                    {/* Comment Form */}
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit((data) => addCommentMutation.mutate(data))}
                        className="flex items-center gap-2 mb-6"
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

                    {/* Comments List */}
                    <div className="space-y-4">
                      {comments?.map((comment) => (
                        <div key={comment.id} className="flex items-start gap-3 p-3 rounded bg-muted/50">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.userId}`} />
                            <AvatarFallback>{comment.userId}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm">{comment.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(comment.createdAt!).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </div>
      </CardContent>
    </Card>
  );
}