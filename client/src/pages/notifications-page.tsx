import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Notification } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Check, Trash2, MessageCircle, Heart, ChevronRight, HandHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/app-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect, useCallback } from "react";
import { CommentDrawer } from "@/components/comments/comment-drawer";

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);

  const closeDrawer = useCallback(() => {
    setSelectedPostId(null);
  }, []);

  useEffect(() => {
    if (selectedPostId === null) return;

    const handlePopState = () => {
      closeDrawer();
    };

    window.history.pushState({ drawerOpen: true }, "");
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [selectedPostId, closeDrawer]);

  const { data: notifications, isLoading, error } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/notifications/${notificationId}/read`
      );
      if (!res.ok) {
        try {
          const error = await res.json();
          throw new Error(error.message || "Failed to mark notification as read");
        } catch (jsonError) {
          console.error("Error parsing response:", jsonError);
          throw new Error("Failed to parse server response");
        }
      }
      try {
        return await res.json();
      } catch (jsonError) {
        console.error("Error parsing response JSON:", jsonError);
        return null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/notifications/${notificationId}`
      );
      if (!res.ok) {
        try {
          const error = await res.json();
          throw new Error(error.message || "Failed to delete notification");
        } catch (jsonError) {
          console.error("Error parsing delete response:", jsonError);
          throw new Error("Failed to parse server response");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({
        title: "Success",
        description: "Notification deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/notifications");
      if (!res.ok) {
        try {
          const error = await res.json();
          throw new Error(error.message || "Failed to delete all notifications");
        } catch (jsonError) {
          console.error("Error parsing delete response:", jsonError);
          throw new Error("Failed to parse server response");
        }
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({
        title: "Success",
        description: `${data.count} notification${data.count !== 1 ? 's' : ''} deleted successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (notification.postId) {
      if (!notification.read) {
        markAsReadMutation.mutate(notification.id);
      }
      setSelectedPostId(notification.postId);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
          <div className="max-w-2xl mx-auto p-4">
            <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Notifications</h1>
          </div>
        </div>
        <div className="flex justify-center items-center h-full mt-[84px]">
          <div className="animate-spin">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
          <div className="max-w-2xl mx-auto p-4">
            <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Notifications</h1>
          </div>
        </div>
        <div className="text-center py-8 text-destructive mt-[84px]">
          <p>Error loading notifications: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Notifications</h1>
        </div>
      </div>

      <main className="pb-24 space-y-4 max-w-2xl mx-auto w-full pl-6 pr-4 py-6 text-lg mt-[40px] md:mt-[100px]">
        {!notifications?.length ? (
          <div className="text-center py-8">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No new notifications</p>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            <div className="flex justify-end mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearAllNotificationsMutation.mutate()}
                disabled={clearAllNotificationsMutation.isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={`relative ${notification.postId ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''} ${!notification.read ? 'border-primary/30 bg-primary/5' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardContent className="p-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1 flex-shrink-0">
                        {notification.type === 'comment' ? (
                          <MessageCircle className="h-5 w-5 text-blue-500" />
                        ) : notification.type === 'reaction' ? (
                          <Heart className="h-5 w-5 text-red-500" />
                        ) : notification.type === 'prayer' ? (
                          <HandHeart className="h-5 w-5 text-purple-500" />
                        ) : (
                          <Bell className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium">{notification.title}</h3>
                        <p className="text-lg text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          {typeof notification.createdAt === 'string' || typeof notification.createdAt === 'number' 
  ? new Date(notification.createdAt).toLocaleString('en-US', { 
      month: 'numeric',
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsReadMutation.mutate(notification.id);
                          }}
                          disabled={markAsReadMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotificationMutation.mutate(notification.id);
                        }}
                        disabled={deleteNotificationMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {notification.postId && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {selectedPostId && (
        <CommentDrawer
          postId={selectedPostId}
          isOpen={true}
          onClose={() => {
            if (window.history.state?.drawerOpen) {
              window.history.back();
            } else {
              setSelectedPostId(null);
            }
          }}
        />
      )}
    </AppLayout>
  );
}