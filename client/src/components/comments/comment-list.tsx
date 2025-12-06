import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { convertUrlsToLinks } from "@/lib/url-utils";
import { MessageCircle, X } from "lucide-react";
import { CommentForm } from "./comment-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CommentActionsDrawer } from "./comment-actions-drawer";
import { useAuth } from "@/hooks/use-auth";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { VideoPlayer } from "@/components/ui/video-player";
import { createMediaUrl, createThumbnailUrl } from "@/lib/media-utils";
import { getThumbnailUrl } from "@/lib/image-utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CommentListProps {
  comments: (Post & { author: User })[];
  postId: number;
  onVisibilityChange?: (isEditing: boolean, isReplying: boolean) => void; // Added prop for visibility callback
}

type CommentWithReplies = Post & {
  author: User;
  replies?: CommentWithReplies[];
};

export function CommentList({ comments: initialComments, postId, onVisibilityChange }: CommentListProps) {
  // Sort the initial comments by creation date (oldest first)
  const sortedInitialComments = [...initialComments].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateA.getTime() - dateB.getTime();
  });

  const [comments, setComments] = useState(sortedInitialComments);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [selectedComment, setSelectedComment] = useState<number | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null); // Added ref for edit form

  // Find the comment we're replying to
  const replyingToComment = comments.find(c => c.id === replyingTo);

  const createReplyMutation = useMutation({
    mutationFn: async (data: { content: string; file?: File; chunkedUploadData?: any }) => {
      if (!replyingTo) throw new Error("No comment selected to reply to");
      if (!user?.id) throw new Error("You must be logged in to reply");

      // Handle chunked upload result (large videos)
      if (data.chunkedUploadData) {
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          content: data.content.trim(),
          parentId: replyingTo,
          depth: (replyingToComment?.depth ?? 0) + 1
        }));
        
        // Add chunked upload metadata
        formData.append('chunkedUploadMediaUrl', data.chunkedUploadData.mediaUrl);
        formData.append('chunkedUploadThumbnailUrl', data.chunkedUploadData.thumbnailUrl || '');
        formData.append('chunkedUploadFilename', data.chunkedUploadData.filename);
        formData.append('chunkedUploadIsVideo', String(data.chunkedUploadData.isVideo));
        
        const res = await fetch("/api/posts/comments", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to post reply:", errorText);
          throw new Error(`Failed to post reply: ${errorText}`);
        }

        return res.json();
      }
      // Handle small file upload
      else if (data.file) {
        // Send as FormData when there's a file
        const formData = new FormData();
        formData.append('data', JSON.stringify({
          content: data.content.trim(),
          parentId: replyingTo,
          depth: (replyingToComment?.depth ?? 0) + 1
        }));
        formData.append('file', data.file);

        const res = await fetch("/api/posts/comments", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to post reply:", errorText);
          throw new Error(`Failed to post reply: ${errorText}`);
        }

        return res.json();
      } else {
        // Send as JSON when there's no file
        const res = await fetch("/api/posts/comments", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: data.content.trim(),
            parentId: replyingTo,
            depth: (replyingToComment?.depth ?? 0) + 1
          }),
          credentials: "include",
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Failed to post reply:", errorText);
          throw new Error(`Failed to post reply: ${errorText}`);
        }

        return res.json();
      }
    },
    onSuccess: (newReply) => {
      const repliedToCommentId = replyingTo;
      setReplyingTo(null);

      fetch(`/api/posts/comments/${postId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error refreshing comments: ${res.status}`);
        }
        return res.json();
      })
      .then(refreshedComments => {
        if (Array.isArray(refreshedComments)) {
          // Sort comments by creation date (oldest first)
          const sortedComments = [...refreshedComments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA.getTime() - dateB.getTime();
          });
          setComments(sortedComments);
          queryClient.setQueryData(["/api/posts/comments", postId], sortedComments);
          queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}/count`] });
          toast({
            description: 
              <div className="flex flex-col">
                <div>Reply added successfully</div>
                <button 
                  className="text-xs text-primary hover:underline text-left mt-1"
                  onClick={() => setReplyingTo(repliedToCommentId)}
                >
                  Reply again to this comment
                </button>
              </div>,
            duration: 5000,
          });
        }
      })
      .catch(err => {
        console.error("Error refreshing comments after reply:", err);
      });
    },
    onError: (error: Error) => {
      console.error("Reply mutation error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to post reply",
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      if (!content.trim()) {
        throw new Error("Comment content cannot be empty");
      }

      const res = await fetch(`/api/posts/comments/${id}`, {
        method: "PATCH",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.trim()
        }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to update comment");
      }

      return res.json();
    },
    onSuccess: (updatedComment) => {
      fetch(`/api/posts/comments/${postId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error refreshing comments: ${res.status}`);
        }
        return res.json();
      })
      .then(refreshedComments => {
        if (Array.isArray(refreshedComments)) {
          // Sort comments by creation date (oldest first)
          const sortedComments = [...refreshedComments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA.getTime() - dateB.getTime();
          });
          setComments(sortedComments);
          queryClient.setQueryData(["/api/posts/comments", postId], sortedComments);
        }
      })
      .catch(err => {
        console.error("Error refreshing comments after edit:", err);
      });

      setEditingComment(null);
      toast({
        description: "Comment updated successfully",
      });
    },
    onError: (error: Error) => {
      console.error("Edit mutation error:", error);
      toast({
        variant: "destructive",
        description: error.message || "Failed to update comment",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      if (!user?.id) throw new Error("You must be logged in to delete a comment");
      const res = await fetch(`/api/posts/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to delete comment");
      }
      return res.json();
    },
    onSuccess: (data, commentId) => {
      fetch(`/api/posts/comments/${postId}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error refreshing comments: ${res.status}`);
        }
        return res.json();
      })
      .then(refreshedComments => {
        if (Array.isArray(refreshedComments)) {
          // Sort comments by creation date (oldest first)
          const sortedComments = [...refreshedComments].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA.getTime() - dateB.getTime();
          });
          setComments(sortedComments);
          queryClient.setQueryData(["/api/posts/comments", postId], sortedComments);
          queryClient.invalidateQueries({ queryKey: [`/api/posts/comments/${postId}/count`] });
        }
      })
      .catch(err => {
        console.error("Error refreshing comments after delete:", err);
      });

      toast({
        description: "Comment deleted successfully",
      });
      setShowDeleteAlert(false);
      setCommentToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment",
      });
      setShowDeleteAlert(false);
      setCommentToDelete(null);
    },
  });

  const handleCopyComment = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      description: "Comment copied to clipboard",
    });
  };

  const commentMap: Record<number, CommentWithReplies> = {};
  comments.forEach(comment => {
    commentMap[comment.id] = { ...comment, replies: [] };
  });

  const topLevelComments: CommentWithReplies[] = [];

  comments.forEach(comment => {
    const commentWithReplies = commentMap[comment.id];

    if (comment.parentId === postId) {
      topLevelComments.push(commentWithReplies);
    } else if (comment.parentId && commentMap[comment.parentId]) {
      const parentComment = commentMap[comment.parentId];
      if (parentComment && parentComment.replies) {
        parentComment.replies.push(commentWithReplies);
      }
    } else if (comment.parentId) {
      console.warn(`Reply ${comment.id} has parent ${comment.parentId} which doesn't exist`);
      topLevelComments.push(commentWithReplies);
    }
  });

  const threadedComments = topLevelComments;

  const formatTimeAgo = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      return `${diffInHours}h`;
    }
    return `${Math.floor(diffInHours / 24)}d`;
  };

  const CommentCard = ({ comment, depth = 0 }: { comment: CommentWithReplies; depth?: number }) => {
    const isOwnComment = user?.id === comment.author?.id;
    const isReplying = replyingTo === comment.id;
    const [imageError, setImageError] = useState(false);

    // Helper function to get video thumbnail URL
    const getVideoThumbnailUrl = (mediaUrl: string) => {
      // Use database thumbnailUrl if available (for HLS videos and new uploads)
      const dbThumbnail = (comment as any).thumbnailUrl || (comment as any).thumbnail_url;
      if (dbThumbnail) {
        return dbThumbnail;
      }
      
      // Don't try to create thumbnails for HLS playlists
      if (mediaUrl.includes('.m3u8') || mediaUrl.includes('/api/hls/')) {
        return undefined;
      }
      
      // For regular video files, create thumbnail URL by replacing extension with .jpg
      if (mediaUrl.toLowerCase().match(/\.(mov|mp4|webm|avi)$/)) {
        let filename = mediaUrl;
        
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
        // Add cache-busting using comment ID to force reload of previously failed thumbnails
        return `/api/serve-file?filename=${encodeURIComponent(jpgFilename)}&_cb=${comment.id}`;
      }

      // For other files, don't create a thumbnail
      return undefined;
    };

    return (
      <div className={`space-y-4 ${depth > 0 ? 'ml-12 mt-3' : ''}`} onContextMenu={(e) => {
        // Prevent browser context menu on entire comment card
        const target = e.target as HTMLElement;
        if (!target.closest('a') && !target.closest('button')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}>
        <div className="flex items-start gap-4 min-w-0">
          <Avatar className={depth > 0 ? 'h-7 w-7' : 'h-10 w-10'}>
            {comment.author?.imageUrl && <AvatarImage src={comment.author.imageUrl} />}
            <AvatarFallback
              style={{ backgroundColor: comment.author?.avatarColor || '#6366F1' }}
              className="text-white"
            >
              {comment.author?.username?.[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <Card
                className={`w-full ${depth > 0 ? 'bg-gray-200 rounded-tl-none' : 'bg-gray-100'}`}
                onClick={(e) => {
                  // Don't show menu if clicking on a link or the play button
                  if (e.target instanceof HTMLElement && (
                    e.target.tagName === 'A' || 
                    e.target.closest('a') ||
                    e.target.closest('button[data-play-button]') ||
                    e.target.closest('button')  // Don't open menu if clicking any button
                  )) {
                    return;
                  }
                  setSelectedComment(comment.id);
                  setIsActionsOpen(true);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedComment(comment.id);
                  setIsActionsOpen(true);
                }}
            >
              {depth > 0 && (
                <div className="absolute -left-8 -top-3 h-6 w-8 border-l-2 border-t-2 border-gray-300 rounded-tl-lg"></div>
              )}
              <CardContent className="pt-3 px-4 pb-3 overflow-hidden max-w-full">
                <div className="flex justify-between">
                  <p className="font-medium">{comment.author?.username}</p>
                </div>
                <p 
                  className="mt-1 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: convertUrlsToLinks(comment.content || '') 
                  }}
                />

                {/* Display media if present */}
                {comment.mediaUrl && !comment.is_video && (
                  <div className="mt-2">
                    {imageError ? (
                      <div className="w-full h-20 bg-gray-200 flex items-center justify-center text-gray-500 rounded-md">
                        <span>Failed to load image</span>
                      </div>
                    ) : (
                      <img 
                        src={getThumbnailUrl(comment.mediaUrl, 'medium')}
                        alt="Comment image" 
                        className="w-full h-auto object-contain rounded-md max-h-[300px]"
                        onLoad={(e) => {
                          const img = e.target as HTMLImageElement;
                          console.log("Comment image loaded successfully:", comment.mediaUrl);
                          console.log("Image dimensions:", img.naturalWidth, "x", img.naturalHeight);
                          setImageError(false);
                        }}
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          console.error("Error loading comment image:", comment.mediaUrl);
                          console.error("Full URL attempted:", img.src);
                          setImageError(true);
                        }}
                        style={{
                          minHeight: '50px',
                          backgroundColor: '#f3f4f6'
                        }}
                      />
                    )}
                  </div>
                )}
                {comment.mediaUrl && comment.is_video && (
                  <div className="mt-2 w-full max-w-full overflow-hidden">
                      <VideoPlayer
                        src={createMediaUrl(comment.mediaUrl)}
                        poster={getVideoThumbnailUrl(comment.mediaUrl)}
                        className="w-full h-auto object-contain rounded-md max-h-[300px]"
                        onError={(error) => console.error("Error loading comment video:", comment.mediaUrl, error)}
                      />
                  </div>
                )}

                <div className="mt-2 flex justify-end">
                  <ReactionSummary postId={comment.id} />
                </div>
              </CardContent>
            </Card>
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {formatTimeAgo(comment.createdAt || new Date())}
              </p>
              <ReactionButton
                postId={comment.id}
                variant="text"
              />
              <Button
                variant="ghost"
                size="sm"
                className={`p-1 h-7 text-sm ${isReplying ? 'bg-gray-200 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyingTo(isReplying ? null : comment.id);
                }}
              >
                {isReplying ? 'Cancel Reply' : 'Reply'}
              </Button>
            </div>
          </div>
        </div>

        {comment.replies?.map((reply) => (
          <CommentCard key={reply.id} comment={reply} depth={depth + 1} />
        ))}

      </div>
    );
  };

  const findSelectedComment = (comments: CommentWithReplies[]): CommentWithReplies | undefined => {
    for (const comment of comments) {
      if (comment.id === selectedComment) return comment;
      if (comment.replies) {
        const found = findSelectedComment(comment.replies);
        if (found) return found;
      }
    }
    return undefined;
  };

  // Direct lookup from flat comments array to ensure we find it
  const selectedCommentData = selectedComment ? comments.find(c => c.id === selectedComment) : undefined;

  useEffect(() => {
    // Notify parent component about visibility changes
    if (onVisibilityChange) {
      onVisibilityChange(!!editingComment, !!replyingTo);
    }
  }, [editingComment, replyingTo, onVisibilityChange]);

  // Auto-focus edit textbox when editing starts
  useEffect(() => {
    if (editingComment) {
      // Use multiple attempts with increasing delays to ensure the portal is rendered
      const attempts = [100, 200, 300, 400, 500];
      attempts.forEach(delay => {
        setTimeout(() => {
          if (editInputRef.current) {
            editInputRef.current.focus();
            console.log("✅ Auto-focused edit textbox at", delay, "ms");
          } else {
            console.log("❌ Edit ref not ready at", delay, "ms");
          }
        }, delay);
      });
    }
  }, [editingComment]);

  // Auto-focus reply textbox when replying starts
  useEffect(() => {
    if (replyingTo) {
      // Use multiple attempts with increasing delays to ensure the portal is rendered
      const attempts = [100, 200, 300, 400, 500];
      attempts.forEach(delay => {
        setTimeout(() => {
          if (replyInputRef.current) {
            replyInputRef.current.focus();
            console.log("✅ Auto-focused reply textbox at", delay, "ms");
          } else {
            console.log("❌ Reply ref not ready at", delay, "ms");
          }
        }, delay);
      });
    }
  }, [replyingTo]);

  // Find the currently editing comment
  const findEditingComment = (comments: CommentWithReplies[]): CommentWithReplies | undefined => {
    for (const comment of comments) {
      if (comment.id === editingComment) return comment;
      if (comment.replies) {
        const found = findEditingComment(comment.replies);
        if (found) return found;
      }
    }
    return undefined;
  };

  const editingCommentData = findEditingComment(threadedComments);

  return (
    <>
      <div className="space-y-4 w-full">
        {threadedComments.map((comment) => (
          <CommentCard key={comment.id} comment={comment} />
        ))}
      </div>

      {/* Inline edit form - NO PORTAL */}
      {editingCommentData && (
          <div 
            className="border-t border-gray-200 p-4 bg-white flex-shrink-0"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              pointerEvents: 'auto'
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              Edit comment
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("Cancel edit clicked");
                setEditingComment(null);
              }}
              type="button"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
          </div>
          <CommentForm
            onSubmit={async (content, file) => {
              console.log("Edit form submitted");
              await editCommentMutation.mutateAsync({ id: editingCommentData.id, content });
              setEditingComment(null);
            }}
            isSubmitting={editCommentMutation.isPending}
            defaultValue={editingCommentData.content || ""}
            onCancel={() => {
              setEditingComment(null);
            }}
            inputRef={editInputRef}
            disableAutoScroll={false}
            skipScrollReset={true}
            key={`edit-form-${editingComment}`}
          />
          </div>
      )}

      {/* Inline reply form - NO PORTAL */}
      {replyingToComment && (
          <div 
            className="border-t border-gray-200 p-4 bg-white flex-shrink-0"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              pointerEvents: 'auto'
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">
              Replying to {replyingToComment.author?.username}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("Cancel reply clicked");
                setReplyingTo(null);
              }}
              type="button"
              data-testid="button-cancel-reply"
            >
              Cancel
            </Button>
          </div>
          <CommentForm
              onSubmit={async (content, file, chunkedUploadData) => {
                console.log("Reply form submitted");
                await createReplyMutation.mutateAsync({ content, file, chunkedUploadData });
                if (replyInputRef.current) {
                  replyInputRef.current.value = '';
                }
              }}
            isSubmitting={createReplyMutation.isPending}
            placeholder={`Reply to ${replyingToComment.author?.username}...`}
            inputRef={replyInputRef}
            disableAutoScroll={false}
            onCancel={() => {
              setReplyingTo(null);
            }}
            key={`reply-form-${replyingTo}`}
            skipScrollReset={true}
          />
          </div>
      )}

      <CommentActionsDrawer
        isOpen={isActionsOpen && !!selectedCommentData}
        onClose={() => {
          console.log("📘 CommentActionsDrawer onClose called");
          setIsActionsOpen(false);
          setSelectedComment(null);
        }}
        onReply={() => {
          console.log("💬 Reply clicked");
          setReplyingTo(selectedComment);
          setIsActionsOpen(false);
        }}
        onEdit={() => {
          console.log("✏️ Edit clicked");
          setEditingComment(selectedComment);
          setIsActionsOpen(false);
        }}
        onDelete={() => {
          console.log("🗑️ Delete clicked");
          setCommentToDelete(selectedComment);
          setShowDeleteAlert(true);
          setIsActionsOpen(false);
        }}
        onCopy={() => {
          console.log("📋 Copy clicked");
          handleCopyComment(selectedCommentData?.content || "");
        }}
        canEdit={user?.id === selectedCommentData?.author?.id}
        canDelete={user?.id === selectedCommentData?.author?.id}
      />

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent className="z-[99999]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your comment and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteAlert(false);
                setCommentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (commentToDelete) {
                  deleteCommentMutation.mutate(commentToDelete);
                }
              }}
              disabled={deleteCommentMutation.isPending}
            >
              {deleteCommentMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}