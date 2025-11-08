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


export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [, navigate] = useLocation();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const keyboardHeight = useKeyboardAdjustmentMessages();

  // Add swipe-to-close functionality - detect swipe right anywhere on the page
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      console.log('📱 Comments page - Touch start anywhere:', { startX, startY });
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      
      const deltaX = endX - startX;
      const deltaY = Math.abs(endY - startY);
      
      console.log('📱 Comments page - Touch end anywhere:', { deltaX, deltaY, startX, endX });
      
      // Right swipe detection: swipe right > 80px anywhere on screen, limited vertical movement
      if (deltaX > 80 && deltaY < 120) {
        console.log('✅ COMMENTS PAGE - RIGHT SWIPE DETECTED ANYWHERE! Going back to home');
        e.preventDefault();
        e.stopPropagation();
        navigate("/");
      }
    };

    // Attach to document for full-page swipe detection
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    console.log('🔥 COMMENTS PAGE - Full-page touch event listeners attached');

    return () => {
      console.log('🔥 COMMENTS PAGE - Cleaning up full-page touch event listeners');
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
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
        className="flex flex-col bg-white w-full overflow-hidden"
        style={{
          position: 'fixed',
          top: '4rem',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 100
        }}
      >
        {/* Swipe detection is handled at document level via useEffect - no overlay needed */}
        
        {/* Fixed Title Box at Top - stays visible when keyboard is shown */}
        <div 
          className="border-b border-gray-200 p-4 bg-white flex-shrink-0"
          style={{
            position: 'fixed',
            top: '4rem',
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: 'white'
          }}
        >
          <h3 className="text-lg font-semibold">Original Post</h3>
        </div>
        
        {/* Scrollable Content */}
        <ScrollArea 
          className="flex-1 overflow-y-auto"
          style={{
            height: keyboardHeight > 0 
              ? `calc(100vh - 4rem - 260px - ${keyboardHeight}px)` 
              : `calc(100vh - 4rem - 260px)`,
            overscrollBehavior: 'none',
            overscrollBehaviorY: 'none',
            marginTop: '60px'
          }}
        >
          <div className="px-4 py-6 space-y-6 bg-white">
            <div className="bg-white">
              <PostView post={originalPost} />
            </div>
            
            {comments.length > 0 && (
              <div className="border-t border-gray-200 pt-6 bg-white">
                <h3 className="text-lg font-semibold mb-4">Comments ({comments.length})</h3>
                <CommentList comments={comments} postId={parseInt(postId)} />
              </div>
            )}
          </div>
        </ScrollArea>
        
        {/* Fixed Comment Form at Bottom */}
        <div 
          className="border-t border-gray-200 p-4 bg-white flex-shrink-0"
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
    </AppLayout>
  );
}