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
import { createDirectDownloadUrl } from "../lib/object-storage-utils";
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
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [triggerReload, setTriggerReload] = useState(0);

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

  // Generate and request video thumbnails on component mount
  useEffect(() => {
    // Run for both memory verse and miscellaneous video posts
    if (post.mediaUrl && 
        (post.type === 'memory_verse' || 
         (post.type === 'miscellaneous' && post.is_video)) && 
        post.mediaUrl.toLowerCase().endsWith('.mov')) {

      console.log(`${post.type} video post detected, generating thumbnails:`, post.id);

      // Choose the appropriate API endpoint based on post type
      const endpoint = post.type === 'memory_verse' 
        ? '/api/memory-verse-thumbnails'
        : '/api/object-storage/generate-thumbnail';

      // Add the file URL for miscellaneous posts
      const url = post.type === 'memory_verse'
        ? endpoint
        : `${endpoint}?fileUrl=${encodeURIComponent(post.mediaUrl)}`;

      // Call the thumbnail generation API
      fetch(url)
        .then(response => response.json())
        .then(data => {
          console.log("Thumbnail generation response:", data);
          // Force reload to use new thumbnails
          setTriggerReload(prev => prev + 1);
        })
        .catch(error => {
          console.error("Error generating thumbnails:", error);
        });
    }
  }, [post.id, post.type, post.mediaUrl, post.is_video]);

  // Handle video thumbnails with proper path extraction
  const getThumbnailUrl = (imageUrl: string) => {
    if (!imageUrl) return '';

    console.log('getThumbnailUrl called with:', imageUrl);

    // If it's already a direct-download URL, return as-is to prevent nesting
    if (imageUrl.includes('/api/object-storage/direct-download')) {
      console.log('Thumbnail URL is already a direct-download URL, returning as-is');
      return imageUrl;
    }

    // Clean the path to get just the filename
    let cleanPath = imageUrl;
    
    // Remove any leading slash and path prefixes to get just the filename
    cleanPath = cleanPath.replace(/^\/+/, ''); // Remove leading slashes
    cleanPath = cleanPath.replace(/^shared\/uploads\//, ''); // Remove shared/uploads prefix
    cleanPath = cleanPath.replace(/^uploads\//, ''); // Remove uploads prefix
    cleanPath = cleanPath.replace(/^thumbnails\//, ''); // Remove thumbnails prefix
    cleanPath = cleanPath.replace(/^thumb-/, ''); // Remove thumb- prefix

    console.log('Clean file path extracted:', cleanPath);

    // For videos, create poster thumbnail path
    if (cleanPath.toLowerCase().endsWith('.mov')) {
      const baseName = cleanPath.substring(0, cleanPath.lastIndexOf('.'));
      const thumbnailKey = `shared/uploads/thumbnails/${baseName}.poster.jpg`;
      console.log('Creating video thumbnail with key:', thumbnailKey);
      const result = createDirectDownloadUrl(thumbnailKey);
      console.log('Video thumbnail URL result:', result);
      return result;
    }

    // For regular images, create thumbnail path
    const thumbnailKey = `shared/uploads/thumbnails/thumb-${cleanPath}`;
    console.log('Creating image thumbnail with key:', thumbnailKey);
    const result = createDirectDownloadUrl(thumbnailKey);
    console.log('Image thumbnail URL result:', result);
    return result;
  };

  // Helper function to get proper image URL
  const getImageUrl = (mediaUrl: string | null) => {
    if (!mediaUrl) return '';

    console.log('PostCard getImageUrl called with:', mediaUrl);

    // If it's already a full URL (starts with http), return as-is
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      return mediaUrl;
    }

    // If it's already a direct-download URL, return as-is to prevent nesting
    if (mediaUrl.includes('/api/object-storage/direct-download')) {
      console.log('PostCard: URL is already a direct-download URL, returning as-is');
      return mediaUrl;
    }

    // Clean the path and create the URL using the utility function
    const result = createDirectDownloadUrl(mediaUrl);
    console.log('PostCard getImageUrl result:', result);
    return result;
  };

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
                {/* Import and use VideoPlayer instead of standard video element */}
                <VideoPlayer 
                  key={`video-${post.id}-${triggerReload}-${Date.now()}`} 
                  src={getImageUrl(post.mediaUrl)}
                  poster={getVideoPoster(post.mediaUrl)}
                  className="w-full video-player-container"
                  preload="metadata"
                  playsInline
                  controlsList="nodownload"
                  onLoad={() => {
                    console.log("Video loaded successfully for post", post.id);
                  }}
                  onError={(error: Error) => {
                    console.error(`Error loading video for post ${post.id}:`, error);

                    // Try with different formats as fallback - first try directly with .jpg extension
                    const mediaUrl = post.mediaUrl || '';
                    if (mediaUrl.toLowerCase().endsWith('.mov')) {
                      const baseName = mediaUrl.substring(0, mediaUrl.lastIndexOf('.'));
                      console.log(`Trying alternative thumbnail for video ${post.id}:`, baseName);

                      // Try to manually preload the correct thumbnail using image tag approach
                      const img = new Image();
                      img.onload = () => {
                        console.log('Alternative thumbnail loaded successfully');
                        // Reload the component to use the now-cached image
                        setTriggerReload(prev => prev + 1);
                      };
                      img.onerror = () => {
                        console.error('Alternative thumbnail failed to load');
                        // Hide the container on all errors
                        const container = document.querySelector(`[data-post-id="${post.id}"] .video-container`) as HTMLElement;
                        if (container) {
                          container.style.display = 'none';
                        }
                      };

                      // Try direct formats without using the utility functions
                      img.src = `/api/object-storage/direct-download?fileUrl=shared/uploads/thumbnails/${baseName.split('/').pop()}.poster.jpg`;
                    } else {
                      // For non-MOV files or if we can't extract baseName, just hide
                      const container = document.querySelector(`[data-post-id="${post.id}"] .video-container`) as HTMLElement;
                      if (container) {
                        container.style.display = 'none';
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <img
                src={getImageUrl(post.mediaUrl)}
                alt={`${post.type} post content`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain cursor-pointer"
                onError={(e) => {
                  // Simply hide the image container without any retries
                  // This is the most reliable approach with the strict Object Storage requirements
                  const img = e.currentTarget as HTMLImageElement;

                  // Hide the parent container if found
                  const mediaContainer = img.closest('.relative.mt-2.w-screen.-mx-4') as HTMLElement;
                  if (mediaContainer) {
                    mediaContainer.style.display = 'none';
                  } else {
                    // If container not found, hide the image itself
                    img.style.display = 'none';
                  }

                  // Also hide any background container
                  const bgContainer = img.closest('.bg-gray-50') as HTMLElement;
                  if (bgContainer) {
                    bgContainer.style.display = 'none';
                  }

                  // Prevent further error handlers from firing
                  img.onerror = null;
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