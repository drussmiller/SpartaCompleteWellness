import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { Post } from "@shared/schema";
import { ReactionButton } from "./reaction-button";

interface PostCardProps {
  post: Post & {
    author?: {
      id: number;
      username: string;
      imageUrl?: string;
    };
  };
}

export function PostCard({ post }: PostCardProps) {
  const [_, navigate] = useLocation();
  const [showFullText, setShowFullText] = useState(false);

  const textContent = post.content || "";
  const hasLongText = textContent.length > 300;
  const displayText = showFullText ? textContent : textContent.slice(0, 300);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-10 w-10">
            <AvatarImage 
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} 
              alt={post.author?.username} 
            />
            <AvatarFallback>{post.author?.username?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{post.author?.username}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(post.createdAt!).toLocaleString()}
                </p>
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                {post.points} points
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">
                {displayText}
                {hasLongText && !showFullText && "..."}
              </p>

              {hasLongText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullText(!showFullText)}
                  className="text-primary hover:text-primary/80"
                >
                  {showFullText ? "Show less" : "Read more"}
                </Button>
              )}

              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt="Post content"
                  className="rounded-md max-h-[300px] w-auto"
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between pt-0">
        <div className="flex gap-2">
          <ReactionButton post={post} />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => navigate(`/comments/${post.id}`)}
        >
          <MessageCircle className="h-4 w-4 mr-1" />
          Comments
        </Button>
      </CardFooter>
    </Card>
  );
}