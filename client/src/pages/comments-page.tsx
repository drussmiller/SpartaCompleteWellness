import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation, useRouter } from "wouter";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useToast } from "@/hooks/use-toast";
import { PostView } from "@/components/comments/post-view";
import { CommentList } from "@/components/comments/comment-list";
import { CommentForm } from "@/components/comments/comment-form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKeyboardAdjustmentMessages } from "@/hooks/use-keyboard-adjustment-messages";
import { useIsMobile } from "@/hooks/use-mobile";

export default function CommentsPage() {
  const isMobile = useIsMobile();
  const { postId } = useParams<{ postId: string }>();
  const [, navigate] = useLocation();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const keyboardHeight = useKeyboardAdjustmentMessages();
  const scrollableRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [isEditingOrReplying, setIsEditingOrReplying] = useState(false);

  // Add swipe-to-close functionality - detect swipe on scrollable area only, exclude form
  useEffect(() => {
    const scrollableElement = scrollableRef.current;
    const formElement = formRef.current;
    if (!scrollableElement) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      // Don't start swipe detection if touching the form area
      if (formElement && e.target instanceof Node && formElement.contains(e.target)) {
        console.log('📱 Ignoring touch - inside form area');
        return;
      }

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      console.log('📱 Comments page - Touch start on scrollable area:', { startX, startY });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // Don't trigger swipe if touching the form area
      if (formElement && e.target instanceof Node && formElement.contains(e.target)) {
        console.log('📱 Ignoring swipe - inside form area');
        return;
      }

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      
      const deltaX = endX - startX;
      const deltaY = Math.abs(endY - startY);
      
      console.log('📱 Comments page - Touch end on scrollable area:', { deltaX, deltaY, startX, endX });
      
      // Right swipe detection: swipe right > 80px, limited vertical movement
      if (deltaX > 80 && deltaY < 120) {
        console.log('✅ COMMENTS PAGE - RIGHT SWIPE DETECTED! Going back to home');
        e.preventDefault();
        e.stopPropagation();
        navigate("/");
      }
    };

    // Attach to scrollable area only
    scrollableElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollableElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    console.log('🔥 COMMENTS PAGE - Touch event listeners attached to scrollable area');

    return () => {
      console.log('🔥 COMMENTS PAGE - Cleaning up touch event listeners');
      scrollableElement.removeEventListener('touchstart', handleTouchStart);
      scrollableElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [navigate]);

  // Fetch original post
  const { data: originalPost, isLoading: isPostLoading, error: postError } = useQuery({
    queryKey: ["/api/posts", postId],
    enabled: Boolean(postId),
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching post:", error);
        throw error;
      }
    }
  });

  // Fetch comments
  const { data: comments = [], isLoading: areCommentsLoading, error: commentsError } = useQuery({
    queryKey: ["/api/posts/comments", postId],
    enabled: Boolean(postId),
    staleTime: 60000, // Increase to 60 seconds
    refetchOnWindowFocus: false,
    refetchInterval: false, // Disable automatic periodic refetching
    refetchOnMount: true, // Only refetch on mount if data is stale
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching comments:", error);
        throw error;
      }
    }
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { content: string; postId: number; file?: File; chunkedUploadData?: any }) => {
      if (!user?.id) throw new Error("You must be logged in to comment");

      try {
        // If we have chunked upload data, use JSON request with chunked upload info
        if (data.chunkedUploadData) {
          const response = await apiRequest("POST", `/api/posts/comments`, {
            type: "comment",
            content: data.content,
            parentId: data.postId,
            chunkedUploadMediaUrl: data.chunkedUploadData.mediaUrl,
            chunkedUploadThumbnailUrl: data.chunkedUploadData.thumbnailUrl,
            chunkedUploadFilename: data.chunkedUploadData.filename,
            chunkedUploadIsVideo: data.chunkedUploadData.isVideo,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to create comment");
          }

          await queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });
          return await response.json();
        }

        // If we have a file, use FormData
        if (data.file) {
          const formData = new FormData();
          formData.append('file', data.file);
          
          const commentData = {
            type: "comment",
            content: data.content,
            parentId: data.postId
          };
          
          formData.append('data', JSON.stringify(commentData));
          
          const response = await fetch('/api/posts/comments', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to create comment");
          }

          await queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });
          return await response.json();
        }

        // Otherwise, use regular JSON request
        const response = await apiRequest("POST", `/api/posts/comments`, {
          type: "comment",
          content: data.content,
          parentId: data.postId
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to create comment");
        }

        // Refresh the comments list
        await queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}`] });

        return await response.json();
      } catch (error) {
        console.error("Error creating comment:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts/comments", postId] });
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

  if (!postId) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Invalid post ID</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Please log in to view comments</p>
        </div>
      </AppLayout>
    );
  }

  if (isPostLoading || areCommentsLoading) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (postError || commentsError) {
    const error = postError || commentsError;
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-destructive">
          <p>{error?.message || "An error occurred"}</p>
        </div>
      </AppLayout>
    );
  }

  if (!originalPost) {
    return (
      <AppLayout title="Comments">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p>Post not found</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Comments">
      <div 
        className={`flex flex-col bg-white overflow-hidden ${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56' : ''}`}
        style={{
          position: 'fixed',
          top: '4rem',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100
        }}
      >
        <div className={`flex flex-col h-full ${!isMobile ? 'border-x border-gray-200' : ''}`}>
          {/* Swipe detection is handled on scrollable area only via useEffect */}
          
          {/* Fixed Title Box at Top */}
          <div className="border-b border-gray-200 p-4 bg-white flex-shrink-0">
            <h3 className="text-lg font-semibold">Original Post</h3>
          </div>
        
        {/* Scrollable Content */}
        <ScrollArea 
          className="flex-1 overflow-y-auto"
          style={{
            height: `calc(100vh - 4rem - 260px)`
          }}
        >
          <div ref={scrollableRef} className="px-4 py-6 space-y-6 bg-white">
            <div className="bg-white">
              <PostView post={originalPost} />
            </div>
            
            {comments.length > 0 && (
              <div className="border-t border-gray-200 pt-6 bg-white">
                <h3 className="text-lg font-semibold mb-4">Comments ({comments.length})</h3>
                <CommentList 
                  comments={comments} 
                  postId={parseInt(postId)} 
                  onVisibilityChange={(isEditing, isReplying) => {
                    console.log("Visibility change:", { isEditing, isReplying });
                    setIsEditingOrReplying(isEditing || isReplying);
                  }}
                />
              </div>
            )}
          </div>
        </ScrollArea>
        </div>
        
        {/* Fixed Comment Form at Bottom - hidden when editing/replying */}
        {!isEditingOrReplying && (
          <div 
            ref={formRef}
            className={`border-t border-gray-200 p-4 bg-white flex-shrink-0 ${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56' : ''}`}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Add a Comment</h3>
            <CommentForm
              onSubmit={async (content, file, chunkedUploadData) => {
                await createCommentMutation.mutateAsync({
                  content,
                  postId: parseInt(postId),
                  file,
                  chunkedUploadData
                });
              }}
              isSubmitting={createCommentMutation.isPending}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}