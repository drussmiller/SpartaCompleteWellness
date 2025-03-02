import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MessageCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);

  const { data: commentCount = 0 } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        if (!post.id) return 0;
        const res = await apiRequest("GET", `/api/posts/comments/${post.id}?count=true`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const count = await res.json();
        return count || 0;
      } catch (error) {
        console.error("Error fetching comment count:", error);
        return 0;
      }
    },
    staleTime: 1000,
    refetchInterval: 3000
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
    onSuccess: () => {
      toast({ description: "Post deleted successfully" });
      // Invalidate relevant queries to refresh the posts list
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete post"
      });
    }
  });

  const handleDelete = async () => {
    try {
      await deletePostMutation.mutateAsync();
      setShowDeleteDialog(false);
    } catch (error) {
      // Error is handled in onError callback
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarImage 
                key={`avatar-${post.author?.id}-${avatarKey}`} 
                src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} 
              />
              <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{post.author.username}</p>
              <p className="text-sm text-muted-foreground">{post.author.points} points</p>
            </div>
          </div>
          {currentUser?.id === post.author.id && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                setShowDeleteDialog(true);
              }}
              className="bg-gray-200 text-black hover:bg-gray-300"
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
            <Link href={`/comments/${post.id}`}>
              <Button variant="ghost" size="sm" className="gap-1.5 bg-gray-200 text-black hover:bg-gray-300">
                <MessageCircle className="h-4 w-4" />
                {commentCount}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-200 text-black hover:bg-gray-300">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-gray-200 text-black hover:bg-gray-300"
              disabled={deletePostMutation.isPending}
            >
              {deletePostMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}