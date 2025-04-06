import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
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

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost || currentUser?.isAdmin;

  // Query to get weekly points total
  const { data: weekPoints, isLoading: isLoadingWeekPoints } = useQuery({
    queryKey: ["/api/posts/points/weekly", post.author.id],
    queryFn: async () => {
      try {
        // Get the week that contains this post's date
        const postDate = new Date(post.createdAt || new Date());

        // Get the first day of the week (Sunday)
        const startOfWeek = new Date(postDate);
        startOfWeek.setDate(postDate.getDate() - postDate.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        // Format for consistent querying
        const startDateStr = startOfWeek.toISOString().split('T')[0];

        const response = await apiRequest(
          "GET", 
          `/api/posts?userId=${post.author.id}&startDate=${startDateStr}&type=all`
        );

        if (!response.ok) {
          return 0;
        }

        const posts = await response.json();
        // Calculate total points for the week
        const total = posts.reduce((sum: number, p: any) => sum + (p.points || 0), 0);
        return total;
      } catch (error) {
        console.error(`Error fetching weekly points for user ${post.author.id}:`, error);
        return 0;
      }
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 1
  });

  const { data: dayPoints, isLoading: isLoadingPoints, error: pointsError } = useQuery({
    queryKey: ["/api/points/daily", post.createdAt, post.author.id],
    queryFn: async () => {
      try {
        // Make sure we have a valid date to work with
        if (!post.createdAt) {
          console.error("Post createdAt is undefined or null", post);
          return 0;
        }

        // Extract the date part only to ensure consistent comparison
        const postDate = new Date(post.createdAt);
        const dateString = postDate.toISOString().split('T')[0];
        console.log(`Fetching points for post ${post.id}, date: ${dateString}, userId: ${post.author.id}`);

        // Use the date in the format YYYY-MM-DD for better consistent results
        const response = await apiRequest(
          "GET", 
          `/api/points/daily?date=${dateString}T00:00:00.000Z&userId=${post.author.id}`
        );

        console.log(`Points API response status: ${response.status} for post ${post.id}`);

        if (!response.ok) {
          let errorText = "Unknown error";
          try {
            errorText = await response.text();
          } catch (e) {
            console.error("Could not read error response", e);
          }
          throw new Error(`Failed to fetch daily points: ${errorText}`);
        }

        let result;
        try {
          result = await response.json();
          console.log('Points API response data:', {
            postId: post.id,
            userId: post.author.id,
            date: dateString,
            points: result.points
          });

          // Log the post's individual points
          if (post.points) {
            console.log(`Post ${post.id} has its own points: ${post.points}`);
          }

          return result.points;
        } catch (jsonError) {
          console.error(`Error parsing points response for post ${post.id}:`, jsonError);
          // Fallback to post's own points if available
          return post.points || 0;
        }
      } catch (error) {
        console.error(`Error fetching daily points for post ${post.id}:`, error);
        // Fallback to post's own points if available
        return post.points || 0;
      }
    },
    staleTime: 60000, // Cache for 1 minute to ensure more frequent updates
    retry: 2
  });

  const { count: commentCount } = useCommentCount(post.id);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      try {
        console.log(`Attempting to delete post ID: ${post.id}`);
        const response = await apiRequest("DELETE", `/api/posts/${post.id}`);
        console.log(`Delete response status: ${response.status}`);

        if (!response.ok) {
          let errorMessage = "Unknown error";
          try {
            const errorText = await response.text();
            console.log(`Error response text: ${errorText}`);
            errorMessage = errorText;
          } catch (readError) {
            console.error("Could not read error response:", readError);
          }
          throw new Error(`Failed to delete post: ${errorMessage}`);
        }

        try {
          const data = await response.json();
          console.log("Delete success response:", data);
          return post.id;
        } catch (jsonError) {
          console.log("Could not parse JSON response, using post ID:", jsonError);
          return post.id;
        }
      } catch (error) {
        console.error("Delete post error:", error);
        throw error;
      }
    },
    onSuccess: (deletedPostId) => {
      console.log(`Post ${deletedPostId} deleted successfully`);
      
      // Get current posts and filter out the deleted one
      const currentPosts = queryClient.getQueryData<(Post & { author: User })[]>(["/api/posts"]);
      if (currentPosts) {
        const filteredPosts = currentPosts.filter(p => p.id !== deletedPostId);
        console.log(`Filtered posts: ${currentPosts.length} -> ${filteredPosts.length}`);
        queryClient.setQueryData(
          ["/api/posts"],
          filteredPosts
        );
      }

      // Force immediate refetch to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error) => {
      console.error("Error deleting post:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete post",
        variant: "destructive",
      });
    },
  });

  const isInViewport = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };

  return (
    <div className="border-y border-gray-200 bg-white w-full">
      <div className="flex flex-row items-center w-full p-4 bg-background">
        <div className="flex items-center gap-4 flex-1">
          <Avatar>
            <AvatarImage
              key={`avatar-${post.author?.id}-${avatarKey}`}
              src={post.author?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${post.author?.username}`}
            />
            <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{post.author.username}</p>
              <span className="text-xs text-muted-foreground">
                {(() => {
                  const diff = Date.now() - new Date(post.createdAt!).getTime();
                  const hours = Math.floor(diff / (1000 * 60 * 60));
                  if (hours < 24) return `${hours}h`;
                  return `${Math.floor(hours / 24)}d`;
                })()}
              </span>
            </div>
            <div className="flex flex-col">
              <p className="text-sm text-muted-foreground">
                {isLoadingPoints ? (
                  <span className="animate-pulse">Calculating points...</span>
                ) : pointsError ? (
                  <span className="text-destructive">Error loading points</span>
                ) : (
                  <span>
                    {post.points ? <span className="font-semibold">{post.points} point{post.points !== 1 ? 's' : ''}</span> : null}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        {canDelete && (
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Post</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this post? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deletePostMutation.mutate();
                    setIsDeleteDialogOpen(false);
                  }}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="px-4">
        {post.content && (
          <p className="text-sm mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
      </div>

      {post.mediaUrl && post.type !== 'scripture' && (
        <div className="w-screen bg-gray-100 -mx-4 relative">
          <div className="min-h-[50vh] max-h-[90vh] w-full flex items-center justify-center py-2">
            {post.type === 'memory_verse' ? (
              <div className="relative w-full">
                <video
                  src={post.mediaUrl}
                  controls
                  preload="metadata"
                  className="w-full h-full object-contain"
                  playsInline
                  muted={false}
                  autoPlay={false}
                  controlsList="nodownload"
                  disablePictureInPicture={false}
                  onError={(e) => {
                    console.error("Failed to load memory verse video:", post.mediaUrl);
                    const videoEl = e.target as HTMLVideoElement;
                    // Try alternative URLs in case the path is wrong
                    const filename = post.mediaUrl?.split('/').pop();
                    if (filename) {
                      // Try different path combinations
                      const alternativeUrls = [
                        `/uploads/${filename}`,
                        `/uploads/videos/${filename}`,
                        `/uploads/memory_verse/${filename}`,
                        `/uploads/miscellaneous/${filename}`,
                      ];
                      
                      // Log the attempts for debugging
                      console.log("Trying alternative URLs for memory verse video:", alternativeUrls);
                      
                      // Try to fix the thumbnail in the background when video fails to load
                      // This helps ensure future video display is better
                      const fixThumbnails = async () => {
                        try {
                          console.log("Triggering memory verse thumbnail fix");
                          
                          // Create a fetch request to the fix-thumbnails endpoint
                          // This will execute thumbnail repair in the background
                          const response = await fetch('/api/memory-verse/fix-thumbnails', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            credentials: 'include',
                          });
                          
                          if (response.ok) {
                            console.log("Memory verse thumbnail fix initiated");
                          } else {
                            console.error("Failed to initiate memory verse thumbnail fix:", await response.text());
                          }
                        } catch (error) {
                          console.error("Error requesting memory verse thumbnail fix:", error);
                        }
                      };
                      
                      // Start the fix in the background without waiting for it
                      fixThumbnails();
                      
                      // Try each alternative URL
                      const tryNextUrl = (index: number) => {
                        if (index < alternativeUrls.length) {
                          videoEl.src = alternativeUrls[index];
                          videoEl.onerror = () => {
                            console.error(`Alternative URL failed: ${alternativeUrls[index]}`);
                            tryNextUrl(index + 1);
                          };
                          videoEl.load();
                        }
                      };
                      
                      tryNextUrl(0);
                    }
                  }}
                />
              </div>
            ) : (
              <img
                src={getThumbnailUrl(post.mediaUrl, 'small')}
                data-full-src={post.mediaUrl}
                alt={`${post.type} post content`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain cursor-pointer"
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (isInViewport(img)) {
                    const mediumUrl = getThumbnailUrl(post.mediaUrl, 'medium');
                    // Preload medium size
                    const preloadImg = new Image();
                    preloadImg.onload = () => {
                      img.src = mediumUrl;
                    };
                    preloadImg.src = mediumUrl;
                  }
                }}
                onError={(e) => {
                  console.error("Failed to load image:", post.mediaUrl);
                  const img = e.currentTarget;
                  img.style.display = 'none';
                  
                  // Add a minimal message instead
                  const container = img.parentElement;
                  if (container) {
                    container.style.minHeight = 'auto';
                    container.style.background = 'transparent';
                  }
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