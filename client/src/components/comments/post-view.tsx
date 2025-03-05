import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Post, User } from "@shared/schema";

interface PostViewProps {
  post: Post & { author: User };
}

export function PostView({ post }: PostViewProps) {
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
                alt="" 
                className="mt-4 rounded-lg max-h-96 object-contain"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
