
import { ArrowLeft, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Post } from "@shared/schema";
import { useToast } from "@/components/ui/use-toast";
import { 
  Drawer, 
  DrawerClose, 
  DrawerContent, 
  DrawerDescription, 
  DrawerFooter, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerTrigger 
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { MoreVertical } from "lucide-react";

type PostWithAuthor = Post & {
  author?: {
    id: number;
    username: string;
    imageUrl?: string;
  };
  replies?: PostWithAuthor[];
  depth?: number;
};

export default function CommentsPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [replyTo, setReplyTo] = useState<{ id: number | null; username: string | null }>({
    id: null,
    username: null
  });
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [commentText, setCommentText] = useState("");
  const [selectedComment, setSelectedComment] = useState<PostWithAuthor | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to delete comment" }));
        throw new Error(error.message || "Failed to delete comment");
      }
    },
    onSuccess: () => {
      toast({ description: "Comment deleted successfully" });
      // Refetch comments
      commentsQuery.refetch();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to delete comment"
      });
    }
  });

  // Fetch post and its comments
  const commentsQuery = useQuery<PostWithAuthor>({
    queryKey: ["post", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch post");
      }
      return res.json();
    },
    enabled: !!postId,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const parentId = replyTo.id || Number(postId);
      const res = await apiRequest("POST", "/api/posts", {
        type: "comment",
        content: comment,
        parentId,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to add comment" }));
        throw new Error(error.message || "Failed to add comment");
      }
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      setReplyTo({ id: null, username: null });
      commentsQuery.refetch();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to add comment",
      });
    },
  });

  const handleAddComment = () => {
    if (commentText.trim()) {
      addCommentMutation.mutate(commentText);
    }
  };

  const handleCopyComment = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => {
        toast({ description: "Comment copied to clipboard" });
        setIsDrawerOpen(false);
      })
      .catch(() => {
        toast({ 
          variant: "destructive", 
          description: "Failed to copy comment" 
        });
      });
  };

  // Focus input when replying
  useEffect(() => {
    if (replyTo.id && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [replyTo.id]);

  if (commentsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading comments...</p>
      </div>
    );
  }

  if (commentsQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Error loading comments. Please try again.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Please log in to view comments.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="container max-w-2xl mx-auto flex-1 pb-24">
        <div className="p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="mr-2"
          >
            <ArrowLeft />
          </Button>
          <h1 className="font-bold text-xl inline-block">Comments</h1>
        </div>

        <div className="space-y-4 p-4">
          {commentsQuery.data?.comments?.map((comment: PostWithAuthor) => (
            <div key={comment.id} className="mb-4">
              <div className="flex items-start space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage 
                    src={comment.author?.imageUrl || undefined} 
                    alt={comment.author?.username || ''} 
                  />
                  <AvatarFallback>
                    {comment.author?.username?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="rounded-xl bg-gray-100 p-3 border border-gray-300 relative">
                    <span className="font-semibold">{comment.author?.username}</span>
                    <p className="text-sm mt-1">{comment.content}</p>
                    
                    <Drawer open={isDrawerOpen && selectedComment?.id === comment.id} onOpenChange={(open) => {
                      setIsDrawerOpen(open);
                      if (open) setSelectedComment(comment);
                    }}>
                      <DrawerTrigger asChild>
                        <button className="absolute top-2 right-2 cursor-pointer text-gray-500">
                          <MoreVertical size={16} />
                        </button>
                      </DrawerTrigger>
                      <DrawerContent className="bg-white">
                        <div className="py-2 px-4">
                          <button className="w-full py-3 text-center border-b border-gray-200 text-gray-800 font-normal" 
                                  onClick={() => {
                                    setReplyTo({ id: comment.id, username: comment.author?.username || '' });
                                    setIsDrawerOpen(false);
                                    if (commentInputRef.current) commentInputRef.current.focus();
                                  }}>
                            Reply
                          </button>
                          
                          {comment.author?.id === user?.id && (
                            <>
                              <button className="w-full py-3 text-center border-b border-gray-200 text-blue-500 font-normal">
                                Edit
                              </button>
                              <button className="w-full py-3 text-center border-b border-gray-200 text-red-500 font-normal"
                                      onClick={() => {
                                        deleteCommentMutation.mutate(comment.id);
                                        setIsDrawerOpen(false);
                                      }}>
                                Delete
                              </button>
                            </>
                          )}
                          
                          <button className="w-full py-3 text-center text-gray-800 font-normal"
                                  onClick={() => handleCopyComment(comment.content || '')}>
                            Copy
                          </button>
                        </div>
                      </DrawerContent>
                    </Drawer>
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-4 bg-white hover:bg-gray-50"
                    >
                      Like
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-4 bg-white hover:bg-gray-50"
                      onClick={() => setReplyTo({ 
                        id: comment.id, 
                        username: comment.author?.username || '' 
                      })}
                    >
                      Reply
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-2">
        <div className="container max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.imageUrl || undefined} alt={user.username} />
              <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 flex items-center bg-gray-100 rounded-full px-3 py-1">
              <Input
                ref={commentInputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={replyTo.id ? `Reply to ${replyTo.username}...` : "Add a comment..."}
                className="flex-1 bg-transparent border-none focus-visible:ring-0"
              />
              
              {replyTo.id && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 mr-1" 
                  onClick={() => setReplyTo({ id: null, username: null })}
                >
                  ✕
                </Button>
              )}
              
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={!commentText.trim() || addCommentMutation.isPending}
                onClick={handleAddComment}
                className="h-8 w-8 p-0"
              >
                {addCommentMutation.isPending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
