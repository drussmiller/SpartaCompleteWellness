
import { useState } from "react";
import { Post, User } from "@shared/schema";
import { formatDistance } from "date-fns";
import { MessageSquare, MoreVertical } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostComments } from "./post-comments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PostCardProps = {
  post: Post & {
    author?: {
      id: number;
      username: string;
      imageUrl?: string;
    };
    commentCount?: number;
  };
  onDelete?: () => void;
};

export function PostCard({ post, onDelete }: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  
  const isOwnPost = user?.id === post.userId;
  const isAdmin = user?.isAdmin;
  const canDelete = isOwnPost || isAdmin;

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/posts/${post.id}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete post" }));
        throw new Error(error.message || "Failed to delete post");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Post deleted successfully" });
      if (onDelete) onDelete();
      // Invalidate queries to refresh the post list
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete post"
      });
    }
  });

  let postType = "";
  switch (post.type) {
    case "food":
      postType = "Food Log";
      break;
    case "workout":
      postType = "Workout";
      break;
    case "scripture":
      postType = "Scripture";
      break;
    case "memory_verse":
      postType = "Memory Verse";
      break;
    default:
      postType = post.type;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center">
          <Avatar className="h-10 w-10 mr-3">
            {post.author?.imageUrl ? (
              <AvatarImage src={post.author.imageUrl} alt={post.author.username} />
            ) : (
              <AvatarFallback>{post.author?.username.charAt(0).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          
          <div>
            <div className="font-semibold">{post.author?.username || "Unknown User"}</div>
            <div className="text-xs text-gray-500 flex items-center">
              <span>{formatDistance(new Date(post.createdAt!), new Date(), { addSuffix: true })}</span>
              <span className="mx-1">•</span>
              <span>{postType}</span>
            </div>
          </div>
        </div>

        {canDelete && (
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="bg-white rounded-t-xl overflow-hidden shadow-lg">
                <div className="flex flex-col w-full">
                  <div className="text-center py-3 border-b border-gray-200 font-semibold text-lg">
                    Post Options
                  </div>
                  
                  <button
                    className="w-full p-4 text-red-500 font-semibold flex justify-center border-b hover:bg-gray-50"
                    onClick={() => deletePostMutation.mutateAsync()}
                  >
                    Delete
                  </button>
                  
                  <button
                    className="w-full p-4 text-gray-700 font-semibold flex justify-center border-b hover:bg-gray-50"
                    onClick={() => {
                      navigator.clipboard.writeText(post.content);
                      toast({ description: "Post content copied to clipboard" });
                    }}
                  >
                    Copy
                  </button>
                  
                  <button
                    className="w-full p-4 bg-gray-200 text-gray-700 font-semibold flex justify-center mt-2 mb-safe"
                    onClick={() => document.body.click()} // Close drawer
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        )}
      </div>

      <p className="mb-3 whitespace-pre-line">{post.content}</p>
      
      {post.imageUrl && (
        <div className="mb-3 overflow-hidden rounded-lg">
          <img src={post.imageUrl} alt="Post attachment" className="w-full object-cover" />
        </div>
      )}

      {post.type !== "comment" && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowComments(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            {post.commentCount || 0} Comments
          </Button>
          
          {/* Facebook-style slide-over panel */}
          {showComments && (
            <div className="fixed inset-0 z-50 overflow-hidden">
              <div className="absolute inset-0 overflow-hidden">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
                  onClick={() => setShowComments(false)}
                />
                
                {/* Slide-over panel */}
                <div className="fixed inset-y-0 right-0 max-w-full flex">
                  <div className="w-screen max-w-md transform transition ease-in-out duration-300 translate-x-0">
                    <div className="h-full flex flex-col bg-white shadow-xl overflow-y-scroll">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b">
                        <h2 className="text-lg font-semibold">Comments</h2>
                        <button
                          onClick={() => setShowComments(false)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <span className="sr-only">Close panel</span>
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Comment content */}
                      <div className="flex-1 p-4">
                        <PostComments postId={post.id} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
