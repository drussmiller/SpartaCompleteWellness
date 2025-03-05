import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Post, User } from "@shared/schema";

interface CommentListProps {
  comments: (Post & { author: User })[];
}

export function CommentList({ comments }: CommentListProps) {
  if (!comments.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-muted-foreground py-6">No comments yet. Be the first to comment!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <Card key={comment.id}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Avatar>
                <AvatarImage 
                  src={comment.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.author?.username}`} 
                />
                <AvatarFallback>{comment.author?.username?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between">
                  <p className="font-medium">{comment.author?.username}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(comment.createdAt!).toLocaleString()}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
