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

export default function CommentsPage() {
  const { postId } = useParams();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof insertPostSchema>>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "comment",
      content: "",
      imageUrl: null,
      points: 1,
      parentId: parseInt(postId!)
    }
  });

  const { data: comments, isLoading, error } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts?parentId=${postId}&type=comment`);
        if (!res.ok) throw new Error("Failed to fetch comments");
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
    enabled: !!postId
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPostSchema>) => {
      const res = await apiRequest("POST", "/api/posts", {
        ...data,
        type: "comment",
        parentId: parseInt(postId!),
        points: 1
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-destructive">
        Error loading comments: {error instanceof Error ? error.message : 'Unknown error'}
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
        <form onSubmit={form.handleSubmit((data) => addCommentMutation.mutateAsync(data))} className="space-y-4 mb-8">
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
          <Button type="submit" disabled={addCommentMutation.isPending}>
            {addCommentMutation.isPending ? "Adding..." : "Comment"}
          </Button>
        </form>
      </Form>

      <div className="space-y-4">
        {comments?.map((comment) => (
          <div key={comment.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Avatar className="h-8 w-8">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${comment.author.username}`} />
              <AvatarFallback>{comment.author.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{comment.author.username}</p>
                <span className="text-muted-foreground">•</span>
                <p className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt!).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm mt-1">{comment.content}</p>
            </div>
          </div>
        ))}
        {!comments?.length && (
          <p className="text-center text-muted-foreground">No comments yet</p>
        )}
      </div>
    </div>
  );
}