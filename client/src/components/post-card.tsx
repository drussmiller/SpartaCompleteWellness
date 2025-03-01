
import { Post, User } from "@shared/schema";
import { formatDistance } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostComments } from "./post-comments";
import { PostOptionsMenu } from "./post-options-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";

interface PostCardProps {
  post: Post & {
    author?: User;
    commentCount?: number;
  };
  onDeletePost?: (postId: number) => void;
}

export function PostCard({ post, onDeletePost }: PostCardProps) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const isOwnPost = user?.id === post.userId;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm relative">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={post.author?.imageUrl || "/default-avatar.jpg"} />
            <AvatarFallback>
              {post.author?.username?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{post.author?.username || "Anonymous"}</p>
            <p className="text-xs text-gray-500">
              {formatDistance(new Date(post.createdAt), new Date(), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
        
        {isOwnPost && (
          <div className="absolute top-2 right-3">
            <PostOptionsMenu postId={post.id} onDelete={onDeletePost} />
          </div>
        )}
      </div>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt="Post"
          className="mb-3 rounded-md w-full object-cover max-h-96"
        />
      )}

      <p className="mb-3 whitespace-pre-line">{post.content}</p>

      {post.type !== "comment" && (
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
              className="text-gray-500 hover:text-gray-700"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              {post.commentCount || 0} Comments
            </Button>
          </DrawerTrigger>
          <DrawerContent className="px-4 py-4">
            <div className="max-w-md mx-auto">
              <h3 className="font-semibold text-lg mb-4">Comments</h3>
              <PostComments postId={post.id} />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}
