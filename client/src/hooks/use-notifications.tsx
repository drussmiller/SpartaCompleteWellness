import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Notification } from "@shared/schema";
import { useLocation } from "wouter";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useNotifications(suppressToasts = false) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Determine if we should show notification toasts
  // Don't show if explicitly suppressed or if we're on the notification-related pages
  const shouldShowToasts = !suppressToasts && 
    !location.includes("notification-schedule") && 
    !location.includes("notifications");

  // Query for notifications
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
  });

  // Function to connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!user) return;

    try {
      setConnectionStatus("connecting");
      
      // Close existing connection if any
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }

      // Set up the WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connection established");
        setConnectionStatus("connected");
        reconnectAttempts.current = 0;
        
        // Authenticate with the server
        if (user) {
          socket.send(JSON.stringify({
            type: "auth",
            userId: user.id
          }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          switch (data.type) {
            case "notification":
              // Show notification toast only if should show toasts
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
              
            case "error":
              console.error("WebSocket error:", data.message);
              break;
              
            default:
              console.log("Received WebSocket message:", data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        setConnectionStatus("disconnected");
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else {
          console.error("Max reconnect attempts reached");
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("disconnected");
      };
      
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
      setConnectionStatus("disconnected");
    }
  }, [user, toast, shouldShowToasts]);

  // Connect to WebSocket when user is available
  useEffect(() => {
    if (user) {
      connectWebSocket();
    } else {
      // Close connection if user logs out
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnectionStatus("disconnected");
    }
    
    // Clean up on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [user, connectWebSocket]);

  // Show toast for new notifications from the REST API - disabled for now
  // We're not showing toasts for existing notifications as they create too many popups
  // They will still appear from WebSocket real-time notifications only
  
  // We've disabled this because:
  // 1. It was showing popups when viewing notification-related pages
  // 2. It was showing all unread notifications on first load, which could be many

  return { 
    connectionStatus,
    notifications,
  };
}