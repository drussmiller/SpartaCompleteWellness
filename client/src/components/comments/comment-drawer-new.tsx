import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { PostView } from "./post-view";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { Post, User } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useRef, useEffect, useState } from "react";

interface CommentDrawerProps {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentDrawer({ postId, isOpen, onClose }: CommentDrawerProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  
  // Manual fetch states
  const [originalPost, setOriginalPost] = useState<Post & { author: User } | null>(null);
  const [isPostLoading, setIsPostLoading] = useState(false);
  const [postError, setPostError] = useState<Error | null>(null);
  
  const [comments, setComments] = useState<Array<Post & { author: User }>>([]);
  const [areCommentsLoading, setAreCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<Error | null>(null);

  // Focus on the comment input when the drawer opens
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

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
            'Accept': 'application/json'
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
        
        // Use XMLHttpRequest instead of fetch to better handle content type issues
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `/api/posts/comments/${postId}`);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.withCredentials = true;
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            const contentType = xhr.getResponseHeader('Content-Type');
            console.log(`Response Content-Type for comments: ${contentType}`);
            
            // Check if we actually got JSON back
            if (contentType && contentType.includes('application/json')) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (Array.isArray(data)) {
                  setComments(data);
                } else {
                  console.error("Comments response is not an array:", data);
                  setComments([]);
                }
              } catch (e) {
                console.error("Error parsing JSON comments:", e);
                console.error("First 200 chars of response:", xhr.responseText.substring(0, 200));
                setCommentsError(new Error("Invalid comment data format"));
                setComments([]);
              }
            } else {
              // Got HTML or something else instead of JSON
              console.error("Received HTML instead of JSON:", xhr.responseText.substring(0, 100));
              setCommentsError(new Error("Server returned HTML instead of JSON"));
              setComments([]);
            }
          } else {
            console.error(`XHR Error (${xhr.status}):`, xhr.statusText);
            setCommentsError(new Error(`Failed to fetch comments: ${xhr.status}`));
            setComments([]);
          }
          
          setAreCommentsLoading(false);
        };
        
        xhr.onerror = function() {
          console.error("Network error when fetching comments");
          setCommentsError(new Error("Network error when fetching comments"));
          setComments([]);
          setAreCommentsLoading(false);
        };
        
        xhr.send();
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
    mutationFn: async (content: string) => {
      const data = {
        type: "comment",
        content: content.trim(),
        parentId: postId,
        points: 1
      };

      console.log(`Creating comment for post ${postId}...`, data);
      
      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
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
    onSuccess: () => {
      // Manually reload comments
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
            setComments(data);
          }
        })
        .catch(err => console.error("Error reloading comments:", err))
        .finally(() => setAreCommentsLoading(false));
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent 
        side="right" 
        ref={drawerRef}
        className="!w-full !p-0 fixed inset-0 z-[99999] !max-w-full comment-drawer bg-background"
        style={{ 
          width: '100vw', 
          maxWidth: '100vw', 
          height: '100%',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))'
        }}
        onOpenAutoFocus={(e) => {
          // Prevent default autofocus and handle it ourselves
          e.preventDefault();
          // Do nothing here - we'll handle it in the useEffect
        }}
        onMouseDown={(e) => {
          // Prevent losing focus when clicking outside the textarea but inside the drawer
          if (e.target instanceof HTMLTextAreaElement) {
            // Allow normal behavior when clicking the textarea itself
            return;
          }
          // For all other elements, prevent default behavior that might steal focus
          e.preventDefault();
          // Focus the textarea on next tick
          setTimeout(() => {
            const textarea = document.getElementById('comment-textarea');
            if (textarea) {
              (textarea as HTMLTextAreaElement).focus();
            }
          }, 0);
        }}
      >
        <div className="h-[100dvh] flex flex-col overflow-hidden w-full">
          {/* Fixed header bar */}
          <div className="h-20 border-b bg-background fixed top-0 left-0 right-0 z-[10000] pt-8">
            {/* Back button */}
            <SheetClose className="absolute top-7 left-4 p-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100">
              <ChevronLeft className="text-xl" />
              <span className="sr-only">Close</span>
            </SheetClose>

            {/* Post author info */}
            {originalPost?.author && (
              <div className="flex flex-col items-start justify-center h-full ml-14">
                {/* User info and time */}
                <div className="flex items-center gap-2">
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
              </div>
            )}
          </div>

          {/* Content area - adjust top margin to account for header */}
          <div className="flex-1 overflow-hidden mt-20">
            {/* Show loading state */}
            {(isPostLoading || areCommentsLoading) && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}

            {/* Show errors if any */}
            {(postError || commentsError) && (
              <div className="flex-1 flex items-center justify-center text-destructive">
                <p>{postError?.message || commentsError?.message || "Failed to load content"}</p>
              </div>
            )}

            {/* Post and comments section with scrolling */}
            {!isPostLoading && !areCommentsLoading && !postError && !commentsError && (
              <>
                <div className="flex-1 overflow-y-auto h-[calc(100vh-12rem)] p-4 space-y-6 w-full max-w-none">
                  {originalPost && <PostView post={originalPost} />}
                  <CommentList comments={comments} postId={postId} />
                </div>

                {/* Fixed comment form at the bottom */}
                <div className="p-4 border-t bg-background fixed bottom-0 left-0 right-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                  <CommentForm
                    onSubmit={async (content) => {
                      await createCommentMutation.mutateAsync(content);
                    }}
                    isSubmitting={createCommentMutation.isPending}
                    ref={commentInputRef}
                    inputRef={commentInputRef}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}