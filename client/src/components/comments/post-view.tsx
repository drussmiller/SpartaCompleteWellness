import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { useCommentCount } from "@/hooks/use-comment-count";
import { ReactionSummary } from "@/components/reaction-summary";

interface PostViewProps {
  post: Post & { author: User };
}

export function PostView({ post }: PostViewProps) {
  const { count: commentCount } = useCommentCount(post.id);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Avatar>
            <AvatarImage 
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`} 
            />
            <AvatarFallback>{post.author?.username?.[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex justify-between">
              <p className="font-medium">{post.author?.username}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(post.createdAt!).toLocaleString()}
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
            {post.imageUrl && (
              <img 
                src={post.imageUrl} 
                alt={post.type}
                className="w-full h-auto object-contain rounded-md mb-4"
              />
            )}
            <div className="mt-2 flex justify-end">
              <ReactionSummary postId={post.id} />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <ReactionButton postId={post.id} />
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                {commentCount}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}