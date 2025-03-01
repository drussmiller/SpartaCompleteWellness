import { useState } from "react";
import { Post, User } from "@shared/schema";
import { formatDistance } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostComments } from "./post-comments";
import { PostOptionsMenu } from "./post-options-menu";

export function PostCard({
  post,
  author,
  commentCount,
  onDelete,
  onRefresh,
}: {
  post: Post;
  author: User;
  commentCount: number;
  onDelete?: () => void;
  onRefresh?: () => void;
}) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [isReplying, setIsReplying] = useState(false);

  const handleReply = () => {
    setShowComments(true);
    setIsReplying(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <img
              src={author.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${author.username}`}
              alt={author.username}
              className="w-10 h-10 rounded-full mr-3"
            />
            <div>
              <h3 className="font-semibold text-gray-900">{author.username}</h3>
              <p className="text-xs text-gray-500">
                {formatDistance(new Date(post.createdAt!), new Date(), { addSuffix: true })}
              </p>
            </div>
          </div>

          {(user?.id === post.userId || user?.isAdmin) && (
            <PostOptionsMenu postId={post.id} onDelete={onDelete} />
          )}
        </div>

        <p className="mt-3 text-gray-800">{post.content}</p>

        {post.imageUrl && (
          <img 
            src={post.imageUrl} 
            alt="Post" 
            className="w-full h-auto rounded-lg mt-3 border border-gray-200" 
          />
        )}
      </div>

      <div className="flex items-center px-4 py-2 border-t border-gray-100">
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
        >
          <MessageSquare className="h-5 w-5 mr-1" />
          <span className="text-sm">{commentCount} comments</span>
        </button>

        <button
          onClick={handleReply}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Reply
        </button>
      </div>

      {showComments && (
        <div className="p-4 border-t border-gray-100">
          <PostComments postId={post.id} isReplying={isReplying} setIsReplying={setIsReplying} />
        </div>
      )}
    </div>
  );
}