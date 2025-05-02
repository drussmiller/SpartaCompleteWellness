import React, { useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Post, User } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, Trash2 } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";
import { getThumbnailUrl, getFallbackImageUrl, checkImageExists } from "../lib/image-utils";

// Production URL for fallback
const PROD_URL = "https://sparta.replit.app";

// Helper function to check if a file URL is likely a video
function isLikelyVideo(url: string, content?: string | null): boolean {
  if (!url) {
    return false;
  }

  // Normalize content to undefined instead of null
  const normalizedContent = content === null ? undefined : content;
  
  // Check file extension
  const urlLower = url.toLowerCase();
  
  // Common video extensions
  if (urlLower.endsWith('.mp4') || 
      urlLower.endsWith('.mov') || 
      urlLower.endsWith('.webm') || 
      urlLower.endsWith('.avi') || 
      urlLower.endsWith('.mkv')) {
    return true;
  }
  
  // Check for [VIDEO] marker in content
  if (normalizedContent && normalizedContent.includes('[VIDEO]')) {
    return true;
  }
  
  // Check for video paths in URL
  if (urlLower.includes('/videos/') || 
      urlLower.includes('/video/') ||
      urlLower.includes('/memory_verse/') ||
      urlLower.includes('/miscellaneous/')) {
    return true;
  }

  // Explicitly check for uploads folder and common video extensions in the filename
  const filename = urlLower.split('/').pop() || '';
  if (
    urlLower.includes('/uploads/') && 
    (filename.includes('.mp4') || 
     filename.includes('.mov') || 
     filename.includes('.webm') || 
     filename.includes('.avi') || 
     filename.includes('.mkv'))
  ) {
    return true;
  }
  
  return false;
}

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost || currentUser?.isAdmin;
  
  // Check if this post should be displayed as a video
  const shouldShowAsVideo = useMemo(() => {
    if (post.type === 'memory_verse') return true;
    
    // For miscellaneous posts, check more aggressively for video markers
    if (post.type === 'miscellaneous' && post.mediaUrl) {
      // Always check for the is_video flag (set during upload)
      if (post.is_video) {
        return true;
      }
      
      // Fall back to URL pattern detection
      return isLikelyVideo(post.mediaUrl, post.content || undefined);
    }
    return false;
  }, [post.type, post.mediaUrl, post.content, post.is_video]);

  // Query to get weekly points total
  const { data: weekPoints, isLoading: isLoadingWeekPoints } = useQuery({
    queryKey: ["/api/posts/points/weekly", post.author?.id],
    queryFn: async () => {
      if (!post.author?.id) return null;
      const res = await fetch(`/api/posts/points/weekly?userId=${post.author.id}`);
      return await res.json();
    },
    enabled: !!post.author?.id && post.type === 'memory_verse'
  });

  // Comment count for this post
  const commentCount = useCommentCount(post.id);
  
  // Delete post mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/posts/${post.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Post deleted",
        description: "Your post has been successfully deleted.",
      });
      
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      
      // If this was a prayer post, also invalidate the prayer requests cache
      if (post.type === "prayer") {
        queryClient.invalidateQueries({ queryKey: ["/api/posts/prayer-requests"] });
      }
    },
    onError: (error) => {
      console.error("Error deleting post:", error);
      toast({
        title: "Error",
        description: "Failed to delete post. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Simple function to get image URL with fallbacks
  const getImageUrl = (url: string | null): string => {
    if (!url) return '';
    
    // Try local URL first
    return url;
  };

  return (
    <div className="flex flex-col rounded-lg shadow-sm bg-card pb-2">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex gap-2 items-center">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={post.author?.imageUrl || undefined} alt={post.author?.username || "User"} key={avatarKey} />
            <AvatarFallback>
              {post.author?.username?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{post.author?.username || "Unknown User"}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(post.createdAt || "").toLocaleString()}
            </span>
          </div>
        </div>

        {canDelete && (
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Delete post">
                <Trash2 className="h-5 w-5 text-red-500" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the post.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => {
                    deleteMutation.mutate();
                    setIsDeleteDialogOpen(false);
                  }}
                  className="bg-red-500 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {post.content && (
        <div className="px-4 py-2">
          <p className="whitespace-pre-wrap break-words text-sm">{post.content}</p>
        </div>
      )}

      {post.mediaUrl && (
        <div className="relative mt-2">
          <div className="w-full max-h-[500px] flex items-center justify-center bg-gray-50">
            {shouldShowAsVideo ? (
              <video
                className="w-full h-full object-contain max-h-[500px]"
                controls
                poster={getThumbnailUrl(post.mediaUrl)}
                playsInline
                preload="metadata"
                src={post.mediaUrl}
                onError={(e) => {
                  console.error("Video load error:", e);
                  const video = e.currentTarget;
                  
                  // Try production URL
                  const prodUrl = `${PROD_URL}${post.mediaUrl}`;
                  console.log("Trying production URL:", prodUrl);
                  video.src = prodUrl;
                }}
              />
            ) : (
              <img
                src={post.mediaUrl}
                alt={`${post.type} post content`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain cursor-pointer"
                onError={(e) => {
                  const img = e.currentTarget;
                  console.error("Failed to load image:", post.mediaUrl);
                  
                  // Try to load directly from production URL
                  const productionUrl = `${PROD_URL}${post.mediaUrl}`;
                  console.log(`Trying production URL: ${productionUrl}`);
                  
                  // Use production URL as first fallback
                  img.src = productionUrl;
                  
                  // Set a one-time error handler for the fallback
                  img.onerror = () => {
                    console.error(`Production fallback also failed for image: ${productionUrl}`);
                    
                    // Try thumbnail as fallback
                    const thumbnailUrl = getThumbnailUrl(post.mediaUrl);
                    console.log(`Trying thumbnail fallback: ${thumbnailUrl}`);
                    
                    img.src = thumbnailUrl;
                    
                    // Set a final error handler for the thumbnail fallback
                    img.onerror = () => {
                      console.error(`Thumbnail fallback also failed. Using placeholder for post ${post.id}`);
                      
                      // Use a simple data URI as final fallback
                      img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' text-anchor='middle' dominant-baseline='middle'%3E${post.type} Image%3C/text%3E%3C/svg%3E`;
                      img.onerror = null; // Clear error handler after final fallback
                    };
                  };
                }}
              />
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <div>
              <ReactionSummary postId={post.id} />
            </div>
          </div>
          <div className="border-t border-gray-200"></div>

          <div className="flex items-center gap-2 py-1 h-10">
            <ReactionButton postId={post.id} variant="icon" />
            <Button
              variant="ghost"
              size="default"
              className="gap-2"
              onClick={() => setIsCommentsOpen(true)}
            >
              <MessageCircle className="h-5 w-5" />
              {commentCount}
            </Button>
          </div>
        </div>
      </div>

      <CommentDrawer
        postId={post.id}
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
      />
    </div>
  );
});