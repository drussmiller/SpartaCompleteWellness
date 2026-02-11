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
import { getDisplayName, getDisplayInitial } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { MessageCircle, Trash2, ImageOff } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useToast } from "@/hooks/use-toast";
import { useCommentCount } from "@/hooks/use-comment-count";
import { CommentDrawer } from "@/components/comments/comment-drawer";
import { getThumbnailUrl, getFallbackImageUrl, checkImageExists } from "../lib/image-utils";
import { createMediaUrl, createThumbnailUrl } from "@/lib/media-utils";
import { VideoPlayer } from "@/components/ui/video-player";
import { generateVideoThumbnails, getVideoPoster } from "@/lib/memory-verse-utils";
import { ImageViewer } from "@/components/ui/image-viewer";

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
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const avatarKey = useMemo(() => post.author?.imageUrl, [post.author?.imageUrl]);
  const isOwnPost = currentUser?.id === post.author?.id;
  const canDelete = isOwnPost || currentUser?.isAdmin;

  // Check if this post should be displayed as a video
  const shouldShowAsVideo = useMemo(() => {
    if (post.type === 'memory_verse') return true;

    // Check for the is_video flag for ANY post type (set during upload)
    if (post.is_video) {
      return true;
    }

    // Check for HLS playlist URLs (used for large videos)
    if (post.mediaUrl && (post.mediaUrl.includes('.m3u8') || post.mediaUrl.includes('/api/hls/'))) {
      return true;
    }

    // For miscellaneous posts, check more aggressively for video markers
    if (post.type === 'miscellaneous' && post.mediaUrl) {
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

      // Invalidate post counts to update limits in Create Post dialog
      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/counts"],
        exact: false 
      });

      // Invalidate has-any-posts check to update dialog state
      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/has-any-posts"],
        exact: false 
      });

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



  const handleFailedPosterLoad = async (mediaUrl: string) => {
        console.log('handleFailedPosterLoad called with:', mediaUrl);
    // No longer auto-generating thumbnails - rely on upload process
  }

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

  // Handle video thumbnails with clean media utilities
  const getThumbnailUrl = (imageUrl: string) => {
    console.log('getThumbnailUrl called with:', imageUrl);
    const result = createThumbnailUrl(imageUrl);
    console.log('Thumbnail URL result:', result);
    return result;
  };

  // Memoize media URLs to prevent re-computation on every render
  const imageUrl = useMemo(() => {
    if (!post.mediaUrl) return null;
    return createMediaUrl(post.mediaUrl);
  }, [post.mediaUrl]);

  const thumbnailUrl = useMemo(() => {
    // Debug: log post object to see what fields we have
    if (post.id === 825 || post.id === 824) {
      console.log(`[DEBUG] Post ${post.id} data:`, JSON.stringify(post, null, 2));
      console.log(`[DEBUG] Post ${post.id} Has thumbnailUrl?`, !!(post as any).thumbnailUrl);
      console.log(`[DEBUG] Post ${post.id} Has thumbnail_url?`, !!(post as any).thumbnail_url);
    }
    
    // Use database thumbnailUrl if available (for HLS videos and new uploads)
    // Try both camelCase and snake_case since Drizzle mapping might vary
    const dbThumbnail = (post as any).thumbnailUrl || (post as any).thumbnail_url;
    if (dbThumbnail) {
      console.log(`[DEBUG] Post ${post.id} using dbThumbnail:`, dbThumbnail);
      return dbThumbnail;
    }
    
    if (!post.mediaUrl) return null;
    
    // Don't try to create thumbnails for HLS playlists
    if (post.mediaUrl.includes('.m3u8') || post.mediaUrl.includes('/api/hls/')) {
      return null;
    }
    
    // For regular video files, create thumbnail URL by replacing extension with .jpg
    if (post.mediaUrl.toLowerCase().match(/\.(mov|mp4|webm|avi)$/)) {
      let filename = post.mediaUrl;
      
      // Extract filename from URL if needed
      if (filename.includes('filename=')) {
        const urlParams = new URLSearchParams(filename.split('?')[1]);
        filename = urlParams.get('filename') || filename;
      } else if (filename.includes('/')) {
        filename = filename.split('/').pop() || filename;
      }
      
      // Remove query parameters
      if (filename.includes('?')) {
        filename = filename.split('?')[0];
      }
      
      // Replace video extension with .jpg
      const jpgFilename = filename.replace(/\.(mov|mp4|webm|avi)$/i, '.jpg');
      // Add cache-busting using post ID to force reload of previously failed thumbnails
      return `/api/serve-file?filename=${encodeURIComponent(jpgFilename)}&_cb=${post.id}`;
    }

    // For non-video files, don't create a thumbnail
    return null;
  }, [post.mediaUrl, (post as any).thumbnailUrl, (post as any).thumbnail_url]);

    const { Play } = useMemo(() => {
        return {
            Play: (props: any) => (
                <svg
                    {...props}
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
            )
        };
    }, []);

  return (
    <div className="flex flex-col pb-2" data-post-id={post.id}>
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex gap-2 items-center">
          <Avatar className="h-10 w-10 border">
            <AvatarImage src={post.author?.imageUrl || undefined} alt={getDisplayName(post.author)} key={avatarKey} />
            <AvatarFallback
              style={{ backgroundColor: post.author?.avatarColor || '#6366F1' }}
              className="text-white"
            >
              {getDisplayInitial(post.author)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{getDisplayName(post.author)}</span>
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
        <div className="relative mt-2 w-screen -mx-4 md:w-full md:mx-0">
          <div className="w-full">
            {shouldShowAsVideo ? (
              <div className="relative w-full video-container" data-post-id={post.id}>
                <VideoPlayer
                  src={createMediaUrl(post.mediaUrl)}
                  poster={thumbnailUrl || undefined}
                  className="w-full video-player-container"
                  preload="metadata"
                  playsInline
                  controlsList="nodownload"
                  onLoad={() => {
                    console.log(`Home page: Video loaded successfully for post ${post.id}`);
                  }}
                  onError={(error) => {
                    console.error(`Failed to load video on home page: ${post.mediaUrl}`, error);
                  }}
                />
              </div>
            ) : imageLoadFailed ? (
              <div className="w-full h-48 bg-gray-100 flex flex-col items-center justify-center text-gray-400 rounded-md">
                <ImageOff className="h-10 w-10 mb-2" />
                <span className="text-sm">Image unavailable</span>
              </div>
            ) : (
              <img
                src={imageUrl || undefined}
                alt={`${post.type} post content`}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-contain cursor-pointer"
                onError={(e) => {
                  console.error('[Image Load Error]', {
                    src: e.currentTarget.src,
                    originalUrl: post.mediaUrl,
                    postId: post.id,
                    postType: post.type,
                    error: 'Image failed to load'
                  });
                  setImageLoadFailed(true);
                }}
                onLoad={() => {
                  console.log('[Image Load Success]', {
                    src: imageUrl,
                    originalUrl: post.mediaUrl,
                    postId: post.id,
                    postType: post.type
                  });
                }}
                onClick={() => {
                  setIsImageViewerOpen(true);
                }}
                data-testid={`img-post-${post.id}`}
              />
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground capitalize">{post.type.replace("_", " ")}</span>
            {post.points !== null && post.points !== undefined && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs font-medium text-primary">{post.points} {post.points === 1 ? 'point' : 'points'}</span>
              </>
            )}
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

      {!shouldShowAsVideo && imageUrl && (
        <ImageViewer
          src={imageUrl}
          alt={`${post.type} post content`}
          isOpen={isImageViewerOpen}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}
    </div>
  );
});