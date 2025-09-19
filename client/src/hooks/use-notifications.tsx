import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Notification as DbNotification } from "@shared/schema";
import { useLocation } from "wouter";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useNotifications(suppressToasts = false) {
  // State and refs
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Determine if we should show notification toasts
  // Don't show if explicitly suppressed or if we're on the notification-related pages
  const shouldShowToasts = !suppressToasts && 
    !location.includes("notification-settings") && 
    !location.includes("notification-schedule") && 
    !location.includes("notifications");

  // Query for notifications
  const { data: notifications } = useQuery<DbNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
  });

  // Simple function to connect to WebSocket server - TEMPORARILY DISABLED
  const connectWebSocket = useCallback(() => {
    // TEMPORARILY DISABLED TO DEBUG RESTART ISSUES
    console.log("WebSocket connection temporarily disabled for debugging");
    setConnectionStatus("disconnected");
    return;
  }, [user, toast, shouldShowToasts]);

  // Connect to WebSocket when user is available
  useEffect(() => {
    if (user && socketRef.current === null) {
      connectWebSocket();
    }
    
    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [user, connectWebSocket]);

  // Helper function to fix memory verse thumbnails
  const fixMemoryVerseThumbnails = useCallback(async () => {
    try {
      console.log("Triggering memory verse thumbnail fix");
      
      // Create a fetch request to the fix-thumbnails endpoint
      const response = await fetch('/api/memory-verse/fix-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log("Memory verse thumbnail fix initiated");
        toast({
          title: "Thumbnail Repair Started",
          description: "Memory verse video thumbnails are being repaired in the background.",
        });
        return true;
      } else {
        console.error("Failed to initiate memory verse thumbnail fix:", await response.text());
        toast({
          title: "Error",
          description: "Failed to start memory verse thumbnail repair process.",
          variant: "destructive"
        });
        return false;
      }
    } catch (error) {
      console.error("Error requesting memory verse thumbnail fix:", error);
      toast({
        title: "Error",
        description: "Failed to connect to the server for memory verse repair.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);
  
  // Helper function to fix all thumbnails including miscellaneous videos
  const fixAllThumbnails = useCallback(async () => {
    try {
      console.log("Triggering all thumbnails fix");
      
      // Create a fetch request to the general fix-thumbnails endpoint
      const response = await fetch('/api/fix-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log("All thumbnails fix initiated");
        toast({
          title: "Thumbnail Repair Started",
          description: "All post thumbnails are being repaired in the background.",
        });
        return true;
      } else {
        console.error("Failed to initiate general thumbnail fix:", await response.text());
        toast({
          title: "Error",
          description: "Failed to start thumbnail repair process.",
          variant: "destructive"
        });
        return false;
      }
    } catch (error) {
      console.error("Error requesting thumbnail fix:", error);
      toast({
        title: "Error",
        description: "Failed to connect to the server for thumbnail repair.",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  return {
    connectionStatus,
    notifications,
    reconnect: connectWebSocket,
    fixMemoryVerseThumbnails,
    fixAllThumbnails
  };
}