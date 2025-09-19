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
    return;
    
    // Exit if no user 
    if (!user) {
      console.log("WebSocket not connecting - user not authenticated");
      return;
    }
    
    console.log("WebSocket connection attempt initiated at", new Date().toISOString());
    
    // Update connection status
    setConnectionStatus("connecting");
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close any existing connection first
    if (socketRef.current) {
      try {
        console.log("Closing existing connection before creating a new one");
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onclose = null;
        socketRef.current.onerror = null;
        socketRef.current.close();
        socketRef.current = null;
      } catch (err) {
        console.error("Error closing existing connection:", err);
        socketRef.current = null;
      }
    }

    // Create a new WebSocket connection after a short delay
    setTimeout(() => {
      try {
        // Set up the WebSocket connection with fresh instance
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        console.log("Creating new WebSocket connection to URL:", wsUrl);
        
        // Create a brand new WebSocket object
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        
        socket.onopen = () => {
          console.log("WebSocket connection established");
          setConnectionStatus("connected");
          
          // Authenticate with the server
          if (user) {
            socket.send(JSON.stringify({
              type: "auth",
              userId: user.id
            }));
          }
          
          // Setup periodic ping to keep connection alive
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }
          
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send(JSON.stringify({
                  type: "ping",
                  timestamp: Date.now()
                }));
                console.log("Ping sent to server");
              } catch (err) {
                console.error("Error sending ping:", err);
              }
            }
          }, 60000); // Send ping every 60 seconds to reduce connection stress
        };
        
        socket.onmessage = (event) => {
          try {
            // Handle string messages as JSON
            if (typeof event.data === 'string') {
              try {
                const data = JSON.parse(event.data);
                console.log("WebSocket message received:", data.type);
                
                // Handle different message types
                switch (data.type) {
                  case "notification":
                    // Handle notification messages
                    if (data.data) {
                      if (shouldShowToasts) {
                        toast({
                          title: data.data.title,
                          description: data.data.message,
                          duration: 5000,
                        });
                      }
                      
                      // Update notifications in the cache
                      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                    }
                    break;
                    
                  case "auth_success":
                    console.log("WebSocket authentication successful");
                    break;
                    
                  case "connected":
                    console.log("WebSocket connection confirmed by server");
                    break;
                    
                  case "pong":
                    console.log("Pong received from server");
                    break;
                    
                  case "error":
                    console.error("WebSocket error message from server:", data.message);
                    break;
                }
              } catch (jsonError) {
                console.error("Failed to parse WebSocket JSON message:", jsonError);
              }
            }
          } catch (error) {
            console.error("Error handling WebSocket message:", error);
          }
        };
        
        socket.onclose = (event) => {
          console.log("WebSocket connection closed with code:", event.code);
          setConnectionStatus("disconnected");
          
          // Clear ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          
          // Schedule a single reconnect attempt
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log("Attempting to reconnect...");
              connectWebSocket();
            }, 5000); // Try to reconnect after 5 seconds
          }
        };
        
        socket.onerror = (event) => {
          console.error("WebSocket error occurred");
          setConnectionStatus("disconnected");
        };
        
      } catch (error) {
        console.error("Error setting up WebSocket:", error);
        setConnectionStatus("disconnected");
      }
    }, 500); // Short delay to ensure clean connection
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