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
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";


export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [, navigate] = useLocation();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // Add swipe-to-close functionality since this page has a chevron close button
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      console.log('🔥 COMMENTS PAGE SWIPE RIGHT TRIGGERED - NAVIGATING BACK');
      // Use wouter's navigate function to go back to home
      navigate("/");
    },
    threshold: 40, // Lower threshold for easier swiping
    maxVerticalMovement: 150 // Allow more vertical movement
  });

  console.log('🔧 Comments page mounted with swipe handlers:', {
    handleTouchStart: !!handleTouchStart,
    handleTouchMove: !!handleTouchMove,
    handleTouchEnd: !!handleTouchEnd
  });

  // Add native event listeners for better touch handling on mobile
  useEffect(() => {
    const container = document.querySelector('[data-swipe-container="true"]');
    if (!container) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwipeInProgress = false;

    const handleNativeTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isSwipeInProgress = false;
      console.log('🟦 NATIVE TOUCH START at:', touch.clientX, touch.clientY);
    };

    const handleNativeTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = Math.abs(touch.clientY - touchStartY);
      
      // Check if this looks like a right swipe
      if (deltaX > 20 && deltaY < 80) {
        if (!isSwipeInProgress) {
          isSwipeInProgress = true;
          console.log('🟩 NATIVE RIGHT SWIPE IN PROGRESS, deltaX:', deltaX, 'deltaY:', deltaY);
        }
        // Prevent default for right swipes
        e.preventDefault();
      }
    };

    const handleNativeTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = Math.abs(touch.clientY - touchStartY);
      
      console.log('🟨 NATIVE TOUCH END - deltaX:', deltaX, 'deltaY:', deltaY);
      
      // Check for right swipe
      if (deltaX > 40 && deltaY < 150) {
        console.log('🟥 NATIVE SWIPE RIGHT DETECTED! Executing close action');
        e.preventDefault();
        navigate("/");
      }
      
      isSwipeInProgress = false;
    };

    container.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
    container.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    container.addEventListener('touchend', handleNativeTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleNativeTouchStart);
      container.removeEventListener('touchmove', handleNativeTouchMove);
      container.removeEventListener('touchend', handleNativeTouchEnd);
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
    mutationFn: async (data: { content: string; postId: number }) => {
      if (!user?.id) throw new Error("You must be logged in to comment");

      try {
        // Submit the comment
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
        className="flex-1 bg-white min-h-screen w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          touchAction: 'pan-y'
        }}
        data-swipe-enabled="true"
        data-swipe-container="true"
      >
        <ScrollArea className="h-[calc(100vh-6rem)]">
          <div className="container mx-auto px-4 py-6 space-y-6 bg-white min-h-full">
            <div className="bg-white">
              <PostView post={originalPost} />
            </div>
            
            {comments.length > 0 && (
              <div className="border-t border-gray-200 pt-6 bg-white">
                <h3 className="text-lg font-semibold mb-4">Comments ({comments.length})</h3>
                <CommentList comments={comments} postId={parseInt(postId)} />
              </div>
            )}
            
            <div className="border-t border-gray-200 pt-6 bg-white">
              <h3 className="text-lg font-semibold mb-4">Add a Comment</h3>
              <CommentForm
                onSubmit={async (content) => {
                  await createCommentMutation.mutateAsync({
                    content: content,
                    postId: parseInt(postId)
                  });
                }}
                isSubmitting={createCommentMutation.isPending}
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </AppLayout>
  );
}