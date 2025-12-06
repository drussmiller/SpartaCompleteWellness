import { createPortal } from "react-dom";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { VideoUploadResult } from "@/hooks/use-video-upload";
import { Post, User } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useRef, useEffect, useState } from "react";
import React from "react";
import { getThumbnailUrl } from "@/lib/image-utils";
import { useKeyboardAdjustment } from "@/hooks/use-keyboard-adjustment";
import { useIsMobile } from "@/hooks/use-mobile";

interface CommentDrawerProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentDrawer({ postId, isOpen, onClose }: CommentDrawerProps): JSX.Element | null {
  const { toast } = useToast();
  const { user } = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  
  // Detect Android device for bottom padding adjustment
  const isAndroid = React.useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  // Manual fetch states
  const [originalPost, setOriginalPost] = useState<Post & { author: User } | null>(null);
  const [isPostLoading, setIsPostLoading] = useState(false);
  const [postError, setPostError] = useState<Error | null>(null);

  const [comments, setComments] = useState<Array<Post & { author: User }>>([]);
  const [areCommentsLoading, setAreCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<Error | null>(null);

  const [isCommentBoxVisible, setIsCommentBoxVisible] = useState(true);
  const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);
  const [viewportTop, setViewportTop] = useState<number>(0);
  const keyboardHeight = useKeyboardAdjustment();

  // Callback to handle visibility
  const handleCommentVisibility = (isEditing: boolean, isReplying: boolean) => {
    setIsCommentBoxVisible(!isEditing && !isReplying);
  };

  // Track viewport height and position changes for keyboard
  useEffect(() => {
    const updateViewport = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setViewportTop(window.visualViewport.offsetTop);
      } else {
        setViewportHeight(window.innerHeight);
        setViewportTop(0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }
    window.addEventListener('resize', updateViewport);

    // Initial setup
    updateViewport();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      }
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Focus on the comment input when the drawer opens (disabled on mobile to prevent keyboard from blocking view)
  useEffect(() => {
    if (isOpen && !isMobile) {
      // Try multiple approaches to ensure focus
      const focusTextarea = () => {
        // Method 1: Direct focus using our ref
        if (commentInputRef.current) {
          commentInputRef.current.focus();
          console.log("Direct focus attempt");
        }

        // Method 2: Find by query selector if ref didn't work
        setTimeout(() => {
          const textarea = document.querySelector('.comment-drawer textarea') as HTMLTextAreaElement;
          if (textarea) {
            textarea.focus();
            console.log("Query selector focus attempt");
          }
        }, 200);
      };

      // Try focusing multiple times with increasing delays
      [50, 150, 300, 600, 1000].forEach(delay => {
        setTimeout(focusTextarea, delay);
      });
    }
  }, [isOpen, isMobile]);

  // Fetch original post manually
  useEffect(() => {
    if (!isOpen || !postId) return;

    async function fetchPost() {
      setIsPostLoading(true);
      setPostError(null);

      try {
        const res = await fetch(`/api/posts/${postId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!res.ok) {
          console.error(`Post fetch error (${res.status})`);
          throw new Error(`Failed to fetch post: ${res.status}`);
        }

        const responseText = await res.text();
        console.log(`Raw post response (first 100 chars):`, responseText.substring(0, 100));

        try {
          const data = JSON.parse(responseText);
          console.log("Post data retrieved successfully:", data);

          // Process video detection more thoroughly, similar to post-card.tsx
          if (data && data.mediaUrl) {
            // First, check if is_video is already set
            if (!('is_video' in data)) {
              // Memory verse posts should always be displayed as videos
              if (data.type === 'memory_verse') {
                data.is_video = true;
                console.log(`Setting memory verse post ${data.id} is_video=true`);
              } 
              // For miscellaneous posts, check for video indicators
              else if (data.type === 'miscellaneous') {
                const mediaUrl = data.mediaUrl.toLowerCase();
                const isVideo = 
                  // Check file extensions
                  mediaUrl.endsWith('.mp4') || 
                  mediaUrl.endsWith('.mov') || 
                  mediaUrl.endsWith('.webm') || 
                  mediaUrl.endsWith('.avi') || 
                  mediaUrl.endsWith('.mkv') ||
                  // Check for video paths
                  mediaUrl.includes('/videos/') || 
                  mediaUrl.includes('/video/') ||
                  mediaUrl.includes('/memory_verse/') ||
                  mediaUrl.includes('/miscellaneous/') ||
                  // Check content for [VIDEO] marker
                  (data.content && data.content.includes('[VIDEO]'));

                data.is_video = isVideo;
                console.log(`Setting miscellaneous post ${data.id} is_video=${isVideo}`);
              } else {
                data.is_video = false;
              }
            }
          }

          setOriginalPost(data);
        } catch (jsonError) {
          console.error("JSON parsing error in post response:", jsonError);
          setPostError(new Error("Invalid post data format"));
        }
      } catch (error) {
        console.error("Error fetching post:", error);
        setPostError(error instanceof Error ? error : new Error("Unknown error"));
      } finally {
        setIsPostLoading(false);
      }
    }

    fetchPost();
  }, [isOpen, postId]);

  // Fetch comments manually
  useEffect(() => {
    if (!isOpen || !postId) return;

    async function fetchComments() {
      setAreCommentsLoading(true);
      setCommentsError(null);

      try {
        console.log(`Manually fetching comments for post ${postId}...`);

        // Use fetch instead of XMLHttpRequest to ensure cookie-based authentication works
        const response = await fetch(`/api/posts/comments/${postId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          credentials: 'include' // This is crucial for sending the session cookie
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Comments fetch error (${response.status}):`, errorText);
          throw new Error(`Failed to fetch comments: ${response.status}`);
        }

        const data = await response.json();
        console.log("Comments data retrieved:", data);

        // Make sure each comment has is_video property if it has mediaUrl
        if (Array.isArray(data)) {
          // Process video detection more thoroughly for comments
          const processedData = data.map(comment => {
            if (comment.mediaUrl && !('is_video' in comment)) {
              // Memory verse comments should always be displayed as videos
              if (comment.type === 'memory_verse') {
                return {...comment, is_video: true};
              } 
              // For miscellaneous and regular comments, check for video indicators
              else if (comment.type === 'miscellaneous' || comment.type === 'comment') {
                const mediaUrl = comment.mediaUrl.toLowerCase();
                const isVideo = 
                  // Check file extensions
                  mediaUrl.endsWith('.mp4') || 
                  mediaUrl.endsWith('.mov') || 
                  mediaUrl.endsWith('.webm') || 
                  mediaUrl.endsWith('.avi') || 
                  mediaUrl.endsWith('.mkv') ||
                  // Check for video paths
                  mediaUrl.includes('/videos/') || 
                  mediaUrl.includes('/video/') ||
                  mediaUrl.includes('/memory_verse/') ||
                  mediaUrl.includes('/miscellaneous/') ||
                  mediaUrl.includes('/hls/') ||
                  // Check content for [VIDEO] marker
                  (comment.content && comment.content.includes('[VIDEO]'));

                return {...comment, is_video: isVideo};
              } else {
                return {...comment, is_video: false};
              }
            }
            return comment;
          });
          setComments(processedData);
        } else {
          console.error("Comments response is not an array:", data);
          setComments([]);
        }

        // We're done loading
        setAreCommentsLoading(false);
      } catch (error) {
        console.error("Error in comments fetch:", error);
        setCommentsError(error instanceof Error ? error : new Error("Unknown error"));
        setComments([]);
        setAreCommentsLoading(false);
      }
    }

    fetchComments();
  }, [isOpen, postId]);

  const createCommentMutation = useMutation({
    mutationFn: async ({ content, file, chunkedUploadData }: { 
      content: string, 
      file?: File,
      chunkedUploadData?: VideoUploadResult
    }) => {
      // Validate: must have either content or media
      const hasMedia = !!file || !!chunkedUploadData;
      const hasContent = content && content.trim().length > 0;
      
      if (!hasContent && !hasMedia) {
        throw new Error("Comment must have either text or media");
      }

      console.log(`Creating comment for post ${postId}...`, { content, hasFile: !!file, hasChunkedUpload: !!chunkedUploadData });

      // Use FormData to handle both text and file uploads
      const formData = new FormData();
      formData.append('type', 'comment');
      formData.append('content', content.trim());
      formData.append('parentId', postId.toString());
      formData.append('points', '1');

      // If we have chunked upload data (HLS converted video), use that instead of raw file
      if (chunkedUploadData) {
        console.log("Using chunked upload data for comment:", chunkedUploadData);
        formData.append('chunkedUploadMediaUrl', chunkedUploadData.mediaUrl);
        if (chunkedUploadData.thumbnailUrl) {
          formData.append('chunkedUploadThumbnailUrl', chunkedUploadData.thumbnailUrl);
        }
        formData.append('chunkedUploadFilename', chunkedUploadData.filename);
        formData.append('chunkedUploadIsVideo', 'true');
        formData.append('is_video', 'true');
        formData.append('selected_media_type', 'video');
      }
      // Append file if provided (for images and small videos)
      else if (file) {
        console.log("Appending file to comment:", file.name, file.type);
        formData.append('image', file); // Using 'image' instead of 'file' to match the server's multer config
        
        // Set is_video flag for video files
        if (file.type.startsWith('video/')) {
          formData.append('is_video', 'true');
          formData.append('selected_media_type', 'video');
          console.log("Marked comment as video");
        }
      }

      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Comment creation error (${res.status}):`, errorText);
          throw new Error(errorText || "Failed to create comment");
        }

        try {
          return await res.json();
        } catch (jsonError) {
          console.error("JSON parsing error in comment creation response:", jsonError);
          throw new Error("Invalid response format when creating comment");
        }
      } catch (error) {
        console.error("Network error when creating comment:", error);
        throw error;
      }
    },
    onSuccess: (newComment) => {
      console.log('Comment created successfully:', newComment);

      // 1. Update local comments state immediately
      if (isOpen && postId) {
        setAreCommentsLoading(true);
        fetch(`/api/posts/comments/${postId}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            console.log(`Fetched ${data.length} comments after creating new one`);
            // Process video detection more thoroughly for comments
            const processedData = data.map(comment => {
              if (comment.mediaUrl && !('is_video' in comment)) {
                // Memory verse comments should always be displayed as videos
                if (comment.type === 'memory_verse') {
                  return {...comment, is_video: true};
                } 
                // For miscellaneous and regular comments, check for video indicators
                else if (comment.type === 'miscellaneous' || comment.type === 'comment') {
                  const mediaUrl = comment.mediaUrl.toLowerCase();
                  const isVideo = 
                    // Check file extensions
                    mediaUrl.endsWith('.mp4') || 
                    mediaUrl.endsWith('.mov') || 
                    mediaUrl.endsWith('.webm') || 
                    mediaUrl.endsWith('.avi') || 
                    mediaUrl.endsWith('.mkv') ||
                    // Check for video paths
                    mediaUrl.includes('/videos/') || 
                    mediaUrl.includes('/video/') ||
                    mediaUrl.includes('/memory_verse/') ||
                    mediaUrl.includes('/miscellaneous/') ||
                    mediaUrl.includes('/hls/') ||
                    // Check content for [VIDEO] marker
                    (comment.content && comment.content.includes('[VIDEO]'));

                  return {...comment, is_video: isVideo};
                } else {
                  return {...comment, is_video: false};
                }
              }
              return comment;
            });
            setComments(processedData);
          }
        })
        .catch(err => console.error("Error reloading comments:", err))
        .finally(() => setAreCommentsLoading(false));
      }

      // 2. Use the QueryClient to update comment counts and invalidate ALL related queries
      if (postId) {
        // Dispatch a global event to update comment counts in all components
        window.dispatchEvent(new CustomEvent('commentCountUpdate', {
          detail: { 
            postId,
            increment: true
          }
        }));

        console.log(`Dispatched commentCountUpdate event for post ${postId}`);

        // Define the list of queries to invalidate immediately
        const queryKeysToInvalidate = [
          // Comments list query - used in the drawer itself
          [`/api/posts/comments/${postId}`],

          // Post details query - used when viewing post details
          [`/api/posts/${postId}`],

          // All posts queries that might show this post
          ['/api/posts', 'team-posts'],
          ['/api/posts/prayer-requests']
        ];

        // Invalidate each query individually
        queryKeysToInvalidate.forEach(queryKey => {
          console.log(`Invalidating query: ${queryKey.join('/')}`);
          queryClient.invalidateQueries({ queryKey, exact: false });
        });

        // Schedule a delayed full invalidation for consistency
        setTimeout(() => {
          // Also invalidate all posts-related queries using a more general approach
          queryClient.invalidateQueries({
            predicate: (query) => {
              const queryKeyString = Array.isArray(query.queryKey) ? query.queryKey.join('/') : String(query.queryKey);
              // Match any queries related to posts
              return queryKeyString.includes('/api/posts');
            },
          });

          console.log(`Delayed full cache invalidation completed for post ${postId}`);
        }, 500);  // 500ms delay to ensure the UI is updated first

        console.log(`All comment-related queries invalidated for post ${postId}`);
      }

      toast({
        description: "Comment posted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to post comment",
      });
    },
  });

  // Prevent scrolling on body when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      ref={drawerRef}
      className="fixed bg-white z-[2147483647] flex flex-col animate-slide-in-from-right"
      style={{
        top: `${viewportTop}px`,
        height: `${viewportHeight}px`,
        left: isMobile ? 0 : '80px',
        right: 0,
        paddingTop: 'env(safe-area-inset-top, 30px)'
      }}
    >
      <div 
        className={`w-full h-full flex flex-col bg-white ${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56' : ''}`}
      >
        <div className={`h-full flex flex-col ${!isMobile ? 'border-x border-gray-200' : ''}`}>
          {/* Fixed header bar */}
          <div className="h-32 border-b bg-background flex-shrink-0 pt-6 flex items-center gap-3 px-4">
          {/* Back button */}
          <button 
            onClick={onClose}
            className="p-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 flex-shrink-0"
          >
            <ChevronLeft className="text-2xl" />
            <span className="sr-only">Close</span>
          </button>

          {/* Post author info */}
          {originalPost?.author && (
            <div className="flex items-center gap-2 flex-1">
              <Avatar className="h-10 w-10">
                {originalPost.author.imageUrl && <AvatarImage src={originalPost.author.imageUrl} alt={originalPost.author.username} />}
                <AvatarFallback
                  style={{ backgroundColor: originalPost.author.avatarColor || '#6366F1' }}
                  className="text-white"
                >
                  {originalPost.author.username?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xl font-semibold">{originalPost.author.username}</span>
              {originalPost?.createdAt && (
                <>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(originalPost.createdAt), { addSuffix: false })}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

          {/* Content area */}
          <div className={`flex-1 overflow-y-auto pt-2 ${isAndroid ? 'pb-40' : ''}`}>
            {/* Show loading state */}
            {(isPostLoading || areCommentsLoading) && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}

            {/* Show errors if any */}
            {(postError || commentsError) && (
              <div className="flex items-center justify-center p-8 text-destructive">
                <p>{postError?.message || commentsError?.message || "Failed to load content"}</p>
              </div>
            )}

            {/* Post and comments section */}
            {!isPostLoading && !areCommentsLoading && !postError && !commentsError && originalPost && (
              <div className="px-4 pb-4">
                <PostView post={originalPost} />
                <div className="border-t border-gray-200 my-4"></div>
                <CommentList 
                  comments={comments} 
                  postId={postId} 
                  onVisibilityChange={handleCommentVisibility}
                />
              </div>
            )}
          </div>

          {/* Comment form at the bottom */}
          {isCommentBoxVisible && (
            <div className={`px-4 pt-4 border-t bg-background flex-shrink-0 ${keyboardHeight > 0 ? 'pb-4' : 'pb-8'}`} style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              <CommentForm
                onSubmit={async (content, file, chunkedUploadData) => {
                  await createCommentMutation.mutateAsync({ content, file, chunkedUploadData });
                }}
                isSubmitting={createCommentMutation.isPending}
                inputRef={commentInputRef}
                disableAutoScroll={isMobile}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}