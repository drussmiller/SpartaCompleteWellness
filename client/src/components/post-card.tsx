import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  // Fetch comment count with automatic updates
  const { data: commentCount } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/count?parentId=${post.id}`);
        if (!res.ok) {
          throw new Error('Failed to fetch comment count');
        }
        return await res.json();
      } catch (error) {
        console.error("Error fetching comment count:", error);
        toast({
          title: "Error",
          description: "Failed to load comment count",
          variant: "destructive",
        });
        return 0;
      }
    },
    // Refetch every 3 seconds to keep count updated
    refetchInterval: 3000,
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
          <Link href={`/posts/${post.id}/comments`}>
            <Button variant="ghost" size="sm" className="ml-auto">
              <MessageCircle className="h-4 w-4 mr-2" />
              {commentCount || 0} Comments
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}