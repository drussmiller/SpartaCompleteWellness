import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MessageCircle } from "lucide-react";

export function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();

  const { data: commentCount } = useQuery<number>({
    queryKey: ["/api/posts", post.id, "comment-count"],
    queryFn: async () => {
      try {
        if (!post.id) return 0;
        const res = await apiRequest("GET", `/api/posts?parentId=${post.id}&type=comment`);
        if (!res.ok) throw new Error("Failed to fetch comments");
        const comments = await res.json();
        return Array.isArray(comments) ? comments.length : 0;
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
            <Button variant="ghost" size="sm" className="gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {commentCount || 0}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}