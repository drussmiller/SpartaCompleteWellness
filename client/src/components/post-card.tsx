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

  // Helper function to get proper image URL with clean media utilities
  const getImageUrl = (mediaUrl: string | null) => {
    console.log('PostCard getImageUrl called with:', mediaUrl);
    const result = createMediaUrl(mediaUrl);
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
        <div className="relative mt-2 w-screen -mx-4" style={{ height: 'auto' }}>
          <div className="w-full bg-gray-50" style={{ height: 'auto' }}>
            {shouldShowAsVideo ? (
              <div 
                  className="w-full video-container" 
                  data-post-id={post.id}
                  style={{ height: 'auto', maxHeight: 'none' }}
                >
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
                        // No longer hiding containers - let images display even if some fail
                      };

                      // Try direct formats without using the utility functions
                      // For memory verse videos, the thumbnails are uploaded with specific naming patterns
                      // Extract the actual filename from the serve-file URL
                      const urlMatch = mediaUrl.match(/filename=([^&]+)/);
                      const actualFileName = urlMatch ? urlMatch[1] : baseName.split('/').pop() || '';

                      console.log('Extracted filename for thumbnail search:', actualFileName);

                      // Extract the base video name (e.g., "IMG_7923.MOV" from "1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.MOV")
                      const baseVideoName = actualFileName.split('-').slice(2).join('-'); // Gets "IMG_7923.MOV"

                      console.log('Base video name for matching:', baseVideoName);

                      // New simplified thumbnail naming: same name as video but with .jpg extension
                      // For video: 1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.MOV
                      // Thumbnail: 1748529996330-74550d7d-aedd-4921-b370-c9551b06754d-IMG_7923.jpg
                      const baseFileName = actualFileName.replace(/\.[^/.]+$/, '');
                      const simplifiedThumbnailUrl = `/api/serve-file?filename=${baseFileName}.jpg`;

                      const thumbnailPatterns = [
                        simplifiedThumbnailUrl,
                        // Fallback patterns for older thumbnails that might still exist
                        `/api/serve-file?filename=1748529997124-43ad0541-8902-4ab6-a24a-27dd42cdb918-IMG-7923.MOV.poster.jpg`,
                        `/api/serve-file?filename=1748529997484-408ee8f6-edb6-45f0-9150-8b31423599c7-thumb-IMG-7923.MOV`,
                        `/api/serve-file?filename=1748529997847-d77d98d7-6baa-4ad5-b11c-d4e13335eea5-IMG-7923.jpg`
                      ];

                      // Try each pattern until one works
                      let patternIndex = 0;
                      const tryNextPattern = () => {
                        if (patternIndex < thumbnailPatterns.length) {
                          img.src = thumbnailPatterns[patternIndex];
                          patternIndex++;
                        }
                      };

                      img.onerror = () => {
                        console.log(`Thumbnail pattern ${patternIndex} failed:`, img.src);
                        tryNextPattern();
                      };

                      // Start with the first pattern
                      tryNextPattern();
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
                  // No longer hiding images - let them display even if some fail to load
                  console.log('Image load error, but not hiding container');
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