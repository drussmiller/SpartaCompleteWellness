import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Notification } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/app-layout";

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: notifications, isLoading, error } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/notifications");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch notifications");
      }
      return response.json();
    },
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/notifications/${notificationId}/read`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to mark notification as read");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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
        const error = await res.json();
        throw new Error(error.message || "Failed to delete notification");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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

  if (isLoading) {
    return (
      <AppLayout>
        {/* Fixed title bar */}
        <div className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="px-6 py-4">
            <h1 className="text-xl font-bold">Notifications</h1>
          </div>
        </div>
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        {/* Fixed title bar */}
        <div className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="px-6 py-4">
            <h1 className="text-xl font-bold">Notifications</h1>
          </div>
        </div>
        <div className="text-center py-8 text-destructive">
          <p>Error loading notifications: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Fixed title bar */}
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>
      </div>

      <main className="p-4 space-y-4 max-w-3xl mx-auto w-full">
        {!notifications?.length ? (
          <div className="text-center py-8">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No new notifications</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((notification) => (
              <Card key={notification.id} className="relative">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium">{notification.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!notification.read && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteNotificationMutation.mutate(notification.id)}
                        disabled={deleteNotificationMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AppLayout>
  );
}