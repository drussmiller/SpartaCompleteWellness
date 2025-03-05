import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuth();
  const [newComment, setNewComment] = useState("");

  // Fetch original post
  const { data: post, isLoading: isLoadingPost, error: postError } = useQuery({
    queryKey: [`/api/posts/${postId}`],
    queryFn: () => apiRequest("GET", `/api/posts/${postId}`).then(res => res.json()),
    enabled: !!postId
  });

  // Fetch comments
  const { data: comments = [], isLoading: isLoadingComments, error: commentsError } = useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: () => apiRequest("GET", `/api/posts/comments/${postId}`).then(res => res.json()),
    enabled: !!postId
  });

  if (!user) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Please login to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoadingPost || isLoadingComments) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (postError || commentsError) {
    return (
      <AppLayout title="Comments">
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center text-destructive">
          <p>{postError?.message || commentsError?.message}</p>
        </div>
      </AppLayout>
    );
  }

  if (!post) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Comments">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Original Post */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarImage src={post.author?.imageUrl} />
                <AvatarFallback>{post.author?.username?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between">
                  <p className="font-medium">{post.author?.username}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(post.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                {post.imageUrl && (
                  <img 
                    src={post.imageUrl} 
                    alt="" 
                    className="mt-4 rounded-lg max-h-96 object-contain"
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comments */}
        <div className="space-y-4">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar>
                    <AvatarImage src={comment.author?.imageUrl} />
                    <AvatarFallback>{comment.author?.username?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="font-medium">{comment.author?.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {comments.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-center text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* New Comment Input */}
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-background border-t p-4">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="resize-none"
              rows={2}
            />
            <Button 
              onClick={() => {
                // TODO: Implement comment submission
                console.log("Submit comment:", newComment);
              }}
            >
              Post
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}