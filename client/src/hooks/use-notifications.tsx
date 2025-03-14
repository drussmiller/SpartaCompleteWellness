import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Notification } from "@shared/schema";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  // Query for notifications
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
  });

  // Show toast for new notifications
  useEffect(() => {
    if (notifications?.length) {
      const unreadNotifications = notifications.filter(n => !n.read);
      unreadNotifications.forEach(notification => {
        if (notification.title.includes("Daily Score Alert")) {
          toast({
            title: notification.title,
            description: notification.message,
            duration: 5000,
          });
        }
      });
    }
  }, [notifications, toast]);

  return { 
    connectionStatus,
    notifications,
  };
}