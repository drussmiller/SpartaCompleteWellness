import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Post, User } from "@shared/schema";
import { formatDistance } from "date-fns";
import { MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostComments } from "./post-comments";
import { PostOptionsMenu } from "./post-options-menu";
import { useState } from "react";

type PostWithAuthor = Post & {
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
    points?: number;
  };
};

export function PostCard({ post }: { post: PostWithAuthor }) {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = React.useState(false);
  const [commentCount, setCommentCount] = React.useState(0);

  const isPostOwner = user?.id === post.userId;
  const canEdit = false; // Set to true if you implement edit functionality later

  React.useEffect(() => {
    // Fetch comment count for this post
    if (post.id) {
      fetch(`/api/posts/comments/${post.id}?count=true`)
        .then((res) => res.json())
        .then((count) => {
          setCommentCount(count);
        });
    }
  }, [post.id]);

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete post");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      // Update user points if the response includes updated user data
      if (data.user) {
        updateUser(data.user);
      }
    },
  });

  const handleDeletePost = (postId: number) => {
    deletePostMutation.mutate(postId);
  };

  function getPostTypeLabel(type: string) {
    const types = {
      food: "Food",
      scripture: "Scripture",
      workout: "Workout",
      memory_verse: "Memory Verse",
    };
    return types[type as keyof typeof types] || type;
  }

  function getPostDate(date: string) {
    return formatDistance(new Date(date), new Date(), { addSuffix: true });
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm relative">
      <div className="flex justify-between items-center"> {/* Added flex and justify-between */}
        <div>
          <div className="p-4">
            <div className="flex items-center mb-4">
              <div className="h-10 w-10 rounded-full overflow-hidden mr-3">
                <img
                  src={post.author?.imageUrl || "/default-avatar.jpg"}
                  alt={post.author?.username || "User"}
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <Link
                  to={`/profile/${post.author?.id}`}
                  className="font-semibold text-gray-900 hover:underline"
                >
                  {post.author?.username || "Anonymous"}
                </Link>
                <div className="text-xs text-gray-500">
                  {getPostDate(post.createdAt?.toString() || "")}
                  {" • "}
                  {getPostTypeLabel(post.type)}
                  {post.points > 0 && ` • ${post.points} points`}
                </div>
              </div>
            </div>
            <div className="text-gray-700 mb-4">{post.content}</div>
            {post.imageUrl && (
              <div className="mb-4 rounded-lg overflow-hidden">
                <img
                  src={post.imageUrl}
                  alt="Post image"
                  className="w-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowComments(!showComments)}
                className="inline-flex items-center text-gray-500 hover:text-gray-700"
              >
                <MessageSquare className="h-5 w-5 mr-1" />
                <span>{commentCount} comments</span>
              </button>
            </div>
          </div>
        </div>
        {/* Options button moved to the right */}
        {user && post.userId === user.id && (
          <div className="ml-4"> {/* Added margin-left for spacing */}
            <PostOptionsMenu
              postId={post.id}
              onDelete={handleDeletePost}
              //onEdit={onEdit}  Assuming onEdit is not implemented yet.
            />
          </div>
        )}
      </div>
      {showComments && (
        <div className="border-t p-4">
          <PostComments postId={post.id} />
        </div>
      )}
    </div>
  );
}