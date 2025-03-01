import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isMarking, setIsMarking] = useState<number | null>(null);

  const { data: notifications = [], isLoading, error, refetch } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  useEffect(() => {
    if (user) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connection established');
      };

      ws.onmessage = (event) => {
        const notification = JSON.parse(event.data);
        console.log('Received notification:', notification);
        refetch();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      return () => {
        ws.close();
      };
    }
  }, [user]);

  async function markAsRead(id: number) {
    setIsMarking(id);
    try {
      await apiRequest("POST", `/api/notifications/${id}/read`);
      await refetch();
      toast({
        title: "Success",
        description: "Notification marked as read",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    } finally {
      setIsMarking(null);
    }
  }

  async function deleteNotification(id: number) {
    setIsDeleting(id);
    try {
      await apiRequest("DELETE", `/api/notifications/${id}`);
      await refetch();
      toast({
        title: "Success",
        description: "Notification deleted",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-6">Notifications</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-red-500">Error loading notifications. Please try again later.</p>
            <Button 
              onClick={() => refetch()} 
              variant="outline" 
              className="mt-4"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <h1 className="text-3xl font-bold mb-6">Notifications</h1>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">No notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card key={notification.id} className={notification.read ? "opacity-50" : ""}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{notification.title}</h3>
                    <p className="text-sm mt-1">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    {!notification.read && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                        disabled={isMarking === notification.id}
                      >
                        {isMarking === notification.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Mark as read"
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteNotification(notification.id)}
                      disabled={isDeleting === notification.id}
                    >
                      {isDeleting === notification.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}