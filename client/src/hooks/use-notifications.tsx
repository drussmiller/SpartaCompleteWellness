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
  const reconnectAttemptsRef = useRef<number>(0); // Ref to track reconnect attempts
  const maxReconnectAttempts = 10; // Define max reconnect attempts
  const lastUserActivityRef = useRef<number>(Date.now()); // Track user activity

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

  // Simple function to connect to WebSocket server
  const connectWebSocket = useCallback(() => {
    if (!user) return; // Ensure user is available

    setConnectionStatus("connecting");
    
    // Use the correct WebSocket URL for your server
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use hostname without port for production compatibility
    const wsHost = window.location.hostname;
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    socketRef.current = new WebSocket(wsUrl)

    socketRef.current.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      // Send a ping to the server to check connection health
      pingIntervalRef.current = setInterval(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 30000); // Send ping every 30 seconds
    };

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle ping message from server
        if (data.type === 'ping') {
          // Respond with pong immediately
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'pong',
              pingTimestamp: data.timestamp
            }));
          }
          return;
        }

        // Handle other message types (e.g., notifications)
        if (data.type === "new_notification" && shouldShowToasts) {
          toast({
            title: "New Notification",
            description: data.content,
          });
        }
        // Update the query cache with the new notification
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      } catch (error) {
        console.error("Failed to process WebSocket message:", error);
      }
    };

    socketRef.current.onclose = (event) => {
      console.log("WebSocket disconnected:", event.code, event.reason);
      setConnectionStatus("disconnected");
      socketRef.current = null;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Don't auto-reconnect to prevent keyboard focus stealing
      console.log('WebSocket disconnected - use reconnect button to retry');
      reconnectAttemptsRef.current++;
    };

    socketRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      // The 'onclose' event will also be fired, so no need to set status/reconnect here
    };

  }, [user, toast, shouldShowToasts]);


  // Track user activity to prevent reconnection during typing
  useEffect(() => {
    const updateActivity = () => {
      lastUserActivityRef.current = Date.now();
    };

    // Listen for keyboard and mouse activity
    document.addEventListener('keydown', updateActivity);
    document.addEventListener('mousedown', updateActivity);
    document.addEventListener('touchstart', updateActivity);

    return () => {
      document.removeEventListener('keydown', updateActivity);
      document.removeEventListener('mousedown', updateActivity);
      document.removeEventListener('touchstart', updateActivity);
    };
  }, []);

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