import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Notification } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BottomNav } from "@/components/bottom-nav";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/use-notifications";

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { connectionStatus } = useNotifications();

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/notifications/${notificationId}/read`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
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

  return (
    <div className="min-h-screen pb-20 lg:pb-0 relative">
      <header className="sticky top-0 z-50 bg-background border-b border-border ml-0 md:ml-16"> {/* Reduced margin from 64 to 16 */}
        <div className="p-4">
          <h1 className="text-xl font-bold pl-2">Notifications</h1>
        </div>
      </header>
      <div className="flex">
        <div className="hidden md:block"> {/* Added vertical navigation */}
          <BottomNav orientation="vertical" />
        </div>
        <main className="p-4 space-y-4 flex-1"> {/* Added flex-1 to allow main content to expand */}
          {notifications?.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No new notifications</p>
            </div>
          ) : (
            notifications?.map((notification) => (
              <Card key={notification.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
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
            ))
          )}
        </main>
      </div>
      <BottomNav /> {/* existing BottomNav remains */}
    </div>
  );
}