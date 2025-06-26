import React, { useState, useMemo, useEffect } from "react";
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
import { createMediaUrl, createThumbnailUrl } from "@/lib/media-utils";
import { createDirectDownloadUrl } from "@/lib/object-storage-utils";
import { VideoPlayer } from "@/components/ui/video-player";
import { generateVideoThumbnails, getVideoPoster } from "@/lib/memory-verse-utils";

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

// Utility function to convert URLs to links
function convertUrlsToLinks(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

export const PostCard = React.memo(function PostCard({ post }: { post: Post & { author: User } }) {
  // Check for post data integrity first
  if (!post) {
    console.error("PostCard: No post data provided");
    return (
      <div className="flex flex-col rounded-lg shadow-sm bg-card pb-2 border-red-500 border-2">
        <div className="p-4 text-red-600">
          <h3>Error: No post data provided</h3>
        </div>
      </div>
    );
  }
  if (!post.id) {
    console.error("PostCard: Post missing ID:", post);
    return (
      <div className="flex flex-col rounded-lg shadow-sm bg-card pb-2 border-red-500 border-2">
        <div className="p-4 text-red-600">
          <h3>Error: Post missing ID</h3>
        </div>
      </div>
    );
  }

  // Initialize hooks (must be at top level, not in try block)
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [triggerReload, setTriggerReload] = useState(0);

  try {

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

    // For any post with a MOV file, force video display
    if (post.mediaUrl && post.mediaUrl.toLowerCase().endsWith('.mov')) {
      return true;
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
  const { count: commentCount } = useCommentCount(post.id);

  // Delete post mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/posts/${post.id}`);
    },
    onSuccess: () => {
      // Post deletion success - no toast notification as requested
      console.log("Post deleted successfully:", post.id);

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

  // DISABLED: Auto-generation of thumbnails to prevent multiple thumbnail creation
  // Thumbnails are now created during upload with simplified naming
  // useEffect(() => {
  //   // Run for both memory verse and miscellaneous video posts
  //   if (post.mediaUrl && 
  //       (post.type === 'memory_verse' || 
  //        (post.type === 'miscellaneous' && post.is_video)) && 
  //       post.mediaUrl.toLowerCase().endsWith('.mov')) {
  //     console.log(`${post.type} video post detected, generating thumbnails:`, post.id);
  //     // ... thumbnail generation code disabled to prevent multiple file creation
  //   }
  // }, [post.id, post.type, post.mediaUrl, post.is_video]);

  // Memoize media URLs to prevent re-computation on every render
  const imageUrl = useMemo(() => {
    if (!post.mediaUrl) {
      return null;
    }
    return createMediaUrl(post.mediaUrl);
  }, [post.mediaUrl]);

  const thumbnailUrl = useMemo(() => {
    if (!post.mediaUrl) {
      return null;
    }

    // For video posts, the thumbnail is already generated with .jpg extension
    if (shouldShowAsVideo && post.mediaUrl.toLowerCase().endsWith('.mov')) {
      const baseFilename = post.mediaUrl.replace(/\.mov$/i, '');
      const thumbnailMediaUrl = `${baseFilename}.jpg`;
      return createMediaUrl(thumbnailMediaUrl);
    }

    // For non-video content, use the original media URL
    return createMediaUrl(post.mediaUrl);
  }, [post.mediaUrl, shouldShowAsVideo]);



  return (
    <div className="flex flex-col rounded-lg shadow-sm bg-card pb-2" data-post-id={post.id}>
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
          <p 
            className="whitespace-pre-wrap break-words text-sm"
            dangerouslySetInnerHTML={{ 
              __html: convertUrlsToLinks(post.content || '') 
            }}
          />
        </div>
      )}

      {post.mediaUrl && (
        <div className="relative mt-2 w-screen -mx-4">
          <div className="w-full bg-gray-50">
            {shouldShowAsVideo ? (
              <div className="w-full video-container" data-post-id={post.id}>
                {/* Show thumbnail with play button overlay instead of video player */}
                {thumbnailUrl ? (
                  <div className="relative w-full cursor-pointer">
                    <img
                      src={thumbnailUrl}
                      alt="Video thumbnail"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      style={{ 
                        aspectRatio: '3/2',
                        maxHeight: '400px'
                      }}
                      onLoad={() => {
                        // Thumbnail loaded successfully
                      }}
                      onError={(e) => {
                        console.error('Failed to load thumbnail for post', post.id);
                      }}
                      onClick={() => {
                        // Navigate to video player page when thumbnail is clicked
                        const videoUrl = imageUrl;
                        if (videoUrl) {
                          window.location.href = `/video-player?src=${encodeURIComponent(videoUrl)}`;
                        }
                      }}
                    />
                    {/* Play button overlay - positioned at bottom left */}
                    <div className="absolute bottom-3 left-3">
                      <div 
                        className="w-12 h-12 bg-black bg-opacity-70 rounded-full flex items-center justify-center hover:bg-opacity-90 transition-all cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          const videoUrl = imageUrl;
                          if (videoUrl) {
                            window.location.href = `/video-player?src=${encodeURIComponent(videoUrl)}`;
                          }
                        }}
                      >
                        <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    </div>

                  </div>
                ) : (
                  // Fallback when no thumbnail is available
                  <div 
                    className="w-full h-40 flex flex-col items-center justify-center cursor-pointer bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      const videoUrl = imageUrl;
                      if (videoUrl) {
                        window.location.href = `/video-player?src=${encodeURIComponent(videoUrl)}`;
                      }
                    }}
                  >
                    <div className="w-12 h-12 bg-black bg-opacity-70 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">Video Ready</p>
                    <p className="text-xs text-gray-500">Click to play</p>
                  </div>
                )}
              </div>
            ) : (
              imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Post content"
                  className="w-full h-full object-contain cursor-pointer"
                  onLoad={() => {
                    // Image loaded successfully
                  }}
                  onError={() => {
                    console.error('Failed to load image for post', post.id);
                  }}
                />
              ) : (
                <div className="w-full h-40 bg-gray-200 flex items-center justify-center">
                  No image available
                </div>
              )
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
  } catch (error) {
    console.error('Error rendering PostCard:', error);
    return (
      <div className="flex flex-col rounded-lg shadow-sm bg-card pb-2 border-red-500 border-2">
        <div className="p-4 text-red-600">
          <h3>Error rendering post {post.id}</h3>
          <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
});