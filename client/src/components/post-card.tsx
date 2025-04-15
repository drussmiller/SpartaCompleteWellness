import React, { useState, useMemo, useEffect } from "react";
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
    console.log(`URL ${url} detected as video by extension`);
    return true;
  }
  
  // Check for [VIDEO] marker in content
  if (normalizedContent && normalizedContent.includes('[VIDEO]')) {
    console.log(`Post content contains [VIDEO] marker`);
    return true;
  }
  
  // Check for video paths in URL
  if (urlLower.includes('/videos/') || 
      urlLower.includes('/video/') ||
      urlLower.includes('/memory_verse/') ||
      urlLower.includes('/miscellaneous/')) {
    console.log(`URL ${url} detected as video by path pattern`);
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
    console.log(`URL ${url} detected as video by filename inside uploads folder`);
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
  const [videoLoadAttempts, setVideoLoadAttempts] = useState(0);
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
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
        console.log(`Displaying miscellaneous post ${post.id} as video based on is_video flag`);
        return true;
      }
      
      // Fall back to URL pattern detection
      const isVideoByUrl = isLikelyVideo(post.mediaUrl, post.content || undefined);
      if (isVideoByUrl) {
        console.log(`Displaying miscellaneous post ${post.id} as video based on URL pattern: ${post.mediaUrl}`);
        return true;
      }
    }
    return false;
  }, [post.type, post.mediaUrl, post.content, post.is_video, post.id]);

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
          <p className="text-base mb-4 whitespace-pre-wrap">{post.content}</p>
        )}
      </div>

      {post.mediaUrl && post.type !== 'scripture' && (
        <div className="w-screen bg-gray-100 -mx-4 relative">
          <div className="min-h-[50vh] max-h-[90vh] w-full flex items-center justify-center py-2">
            {shouldShowAsVideo ? (
              <div className="relative w-full">
                {videoLoadError && (
                  <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-xs p-1 z-10">
                    Video loading error (attempt {videoLoadAttempts}) - Trying alternative sources...
                  </div>
                )}
                <video
                  key={`video-${post.id}-${videoLoadAttempts}`}
                  src={post.mediaUrl}
                  poster={getThumbnailUrl(post.mediaUrl, 'medium')}
                  controls
                  preload="metadata"
                  className="w-full h-full object-contain"
                  playsInline
                  muted={false}
                  autoPlay={false}
                  controlsList="nodownload"
                  disablePictureInPicture={false}
                  onLoadStart={() => {
                    console.log(`Video onLoadStart for post ${post.id}, using poster: ${getThumbnailUrl(post.mediaUrl, 'medium')}`);
                  }}
                  onLoadedMetadata={() => {
                    console.log(`Video metadata loaded successfully for post ${post.id}`);
                    // Reset error state if video loads successfully
                    if (videoLoadError) {
                      setVideoLoadError(null);
                    }
                  }}
                  onError={(e) => {
                    const errorMsg = `Failed to load ${post.type} video: ${post.mediaUrl}`;
                    console.error(errorMsg);
                    setVideoLoadError(errorMsg);
                    setVideoLoadAttempts(prev => prev + 1);
                    
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
                      
                      // Add more detailed logging including post ID
                      console.log(`Trying alternative URLs for ${post.type} video (post ID: ${post.id}):`, {
                        originalUrl: post.mediaUrl,
                        alternativeUrls,
                        filename,
                        postType: post.type,
                        contentHasVideoMarker: post.content?.includes('[VIDEO]') || false,
                        isLikelyVideoResult: post.mediaUrl ? isLikelyVideo(post.mediaUrl, post.content || undefined) : false,
                        videoLoadAttempts: videoLoadAttempts + 1,
                      });
                      
                      // Try to fix the thumbnail and poster in the background when video fails to load
                      const fixVideoDisplay = async () => {
                        try {
                          console.log(`Trying to fix video display for post ${post.id}, type ${post.type}`);
                          
                          // First, generate the poster image 
                          // This creates a .poster.jpg file which our updated getThumbnailUrl function will use
                          const posterResponse = await fetch('/api/video/generate-posters', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ 
                              mediaUrl: post.mediaUrl,
                              postId: post.id,
                            }),
                            credentials: 'include',
                          });
                          
                          if (posterResponse.ok) {
                            console.log(`Video poster generation initiated for post ${post.id}`);
                          } else {
                            const errorText = await posterResponse.text();
                            console.error(`Failed to generate poster for video:`, errorText);
                          }
                          
                          // Also try to fix any thumbnails as a fallback
                          const endpoint = post.type === 'memory_verse' 
                            ? '/api/memory-verse/fix-thumbnails'
                            : '/api/fix-thumbnails';
                            
                          const thumbnailResponse = await fetch(endpoint, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ 
                              mediaUrl: post.mediaUrl,
                              postId: post.id,
                              postType: post.type
                            }),
                            credentials: 'include',
                          });
                          
                          if (thumbnailResponse.ok) {
                            console.log(`${post.type} thumbnail fix initiated for post ${post.id}`);
                          } else {
                            const errorText = await thumbnailResponse.text();
                            console.error(`Failed to initiate ${post.type} thumbnail fix:`, errorText);
                          }
                          
                          // Let the user know we're trying to fix things
                          setVideoLoadError(`Working on fixing video display for post ${post.id}...`);
                          
                          // After a short delay, try to refresh the video
                          setTimeout(() => {
                            // Force React to rerender the video by updating the attempt counter
                            setVideoLoadAttempts(prev => prev + 1);
                          }, 3000);
                          
                        } catch (error) {
                          console.error(`Error requesting video display fixes:`, error);
                          setVideoLoadError(`Error fixing video: ${error instanceof Error ? error.message : String(error)}`);
                        }
                      };
                      
                      // Start the fix in the background without waiting for it
                      fixVideoDisplay();
                      
                      // Try each alternative URL
                      const tryNextUrl = (index: number) => {
                        if (index < alternativeUrls.length) {
                          const currentAttempt = index + 1;
                          setVideoLoadAttempts(currentAttempt);
                          console.log(`Trying URL ${currentAttempt} of ${alternativeUrls.length}: ${alternativeUrls[index]}`);
                          
                          videoEl.src = alternativeUrls[index];
                          videoEl.onerror = () => {
                            console.error(`Alternative URL failed: ${alternativeUrls[index]}`);
                            tryNextUrl(index + 1);
                          };
                          videoEl.onloadeddata = () => {
                            console.log(`Alternative URL succeeded: ${alternativeUrls[index]}`);
                            setVideoLoadError(null);
                          };
                          videoEl.load();
                        } else {
                          console.error(`All ${alternativeUrls.length} alternative URLs failed for post ${post.id}`);
                          setVideoLoadError(`Could not load video after trying ${alternativeUrls.length} different paths.`);
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