import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useCommentCount } from "@/hooks/use-comment-count";

interface PostViewProps {
  post: Post & { author: User };
}

export function PostView({ post }: PostViewProps) {
  const { count: commentCount } = useCommentCount(post.id);
  return (
    <Card className="relative w-full rounded-none mx-[-1rem]">
      <CardContent className="pt-6 px-6">
        <div className="flex flex-col">
          <div>
            <div className="flex justify-between">
              <div className="flex items-center">
                <p className="font-medium">{post.author?.username}</p>
              </div>
            </div>
            <div className="mt-2 border-t border-gray-200"></div>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
          {post.imageUrl && (
            <div className="mt-2 mb-2">
              <img
                src={post.imageUrl}
                alt={post.type}
                className="w-full h-auto object-contain rounded-md"
              />
            </div>
          )}
          <div className="border-t border-gray-200"></div>
          <div className="flex items-center gap-2 py-0.5">
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

          {/* Grey line separator */}
          <div className="border-t border-gray-200 mt-0.5"></div>

          {/* Reactions display */}
          <div className="flex justify-between items-center">
            <ReactionSummary postId={post.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}