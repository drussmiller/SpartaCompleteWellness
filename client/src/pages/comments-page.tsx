import { useState, useRef } from "react";
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


export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const [, navigate] = useLocation();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // Direct swipe handling with detailed logging
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    console.log('🟢 COMMENTS: Touch start at', touch.clientX, touch.clientY, 'target:', e.target);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    console.log('🔵 COMMENTS: Touch move at', touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('🔵 COMMENTS: Touch end - deltaX:', deltaX, 'deltaY:', deltaY);
    
    // Check for right swipe: positive deltaX with minimum distance and not too much vertical movement
    if (deltaX > 50 && deltaY < 200) {
      console.log('✅ COMMENTS: Right swipe detected! Triggering navigation');
      e.preventDefault();
      e.stopPropagation();
      
      // Simple navigation back
      setTimeout(() => {
        console.log('🚀 COMMENTS: Executing navigation...');
        window.history.back();
      }, 50);
    } else {
      console.log('❌ COMMENTS: No valid swipe - deltaX:', deltaX, 'deltaY:', deltaY);
    }
  };

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
    refetchOnMount: "if-stale", // Only refetch on mount if data is stale
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
    <div 
      className="min-h-screen w-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      <AppLayout title="Comments">
        <div className="flex-1 bg-white">
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
    </div>
  );
}