import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { Notification as DbNotification } from "@shared/schema";
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
  const { data: notifications } = useQuery<DbNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60000, // Refetch every minute
  });

  // Function to connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!user) {
      console.log("WebSocket not connecting - user not authenticated");
      return;
    }

    try {
      // Ensure we're in a disconnected state before trying to reconnect
      // This prevents any issues with previous connection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      setConnectionStatus("connecting");
      console.log("WebSocket connecting...", new Date().toISOString());
      
      // Close existing connection if any
      if (socketRef.current) {
        console.log("WebSocket current state:", 
          socketRef.current.readyState === WebSocket.CONNECTING ? "CONNECTING" :
          socketRef.current.readyState === WebSocket.OPEN ? "OPEN" :
          socketRef.current.readyState === WebSocket.CLOSING ? "CLOSING" : 
          socketRef.current.readyState === WebSocket.CLOSED ? "CLOSED" : "UNKNOWN"
        );
        
        try {
          if (socketRef.current.readyState === WebSocket.OPEN || 
              socketRef.current.readyState === WebSocket.CONNECTING) {
            console.log("Closing existing WebSocket connection");
            socketRef.current.close();
          }
          
          // Release the reference to the old WebSocket to prevent memory leaks
          socketRef.current = null;
        } catch (closeError) {
          console.error("Error closing existing WebSocket:", closeError);
          // Continue anyway - we want to create a fresh connection
          socketRef.current = null;
        }
      }

      // Set up the WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log("WebSocket URL:", wsUrl);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // Debug socket properties
      console.log("WebSocket object created, protocol:", socket.protocol, "binaryType:", socket.binaryType);

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
          // Log raw data for debugging purposes
          console.log(`WebSocket raw message received at ${new Date().toISOString()}, typeof:`, typeof event.data);
          
          // Handle different message data types
          let data;
          if (typeof event.data === 'string') {
            try {
              data = JSON.parse(event.data);
            } catch (jsonError) {
              console.error("Failed to parse WebSocket JSON message:", jsonError);
              console.log("Raw WebSocket message content:", event.data.length > 200 
                ? event.data.substring(0, 200) + "..." 
                : event.data);
              return; // Exit early, can't process non-JSON data
            }
          } else if (event.data instanceof Blob) {
            console.log("Received binary WebSocket data, length:", event.data.size);
            // We could add blob handling here if needed
            return; // Exit early
          } else {
            console.error("Unsupported WebSocket data type:", typeof event.data);
            return; // Exit early
          }
          
          // Handle different message types
          switch (data.type) {
            case "notification":
              console.log("Received notification message:", data);
              // Show notification toast only if should show toasts
              if (data.data) {
                // Check if notification has a sound property
                if (data.data.sound) {
                  try {
                    // Play a notification sound
                    // For mobile devices, we need to create and play an audio element 
                    // instead of using the Web Audio API which may require user interaction
                    const audio = new Audio();
                    
                    // Use "default" sound or custom sounds if specified
                    if (data.data.sound === "default") {
                      // Use a short notification sound
                      audio.src = "/notification.wav"; // Use the WAV file we downloaded
                    } else {
                      // You could add other sound options here
                      audio.src = `/sounds/${data.data.sound}.mp3`;
                    }
                    
                    // Add event logging
                    audio.oncanplay = () => console.log("Audio is ready to play");
                    audio.onplay = () => console.log("Audio started playing");
                    audio.onerror = (e) => console.error("Audio error:", e);
                    
                    // Play the sound - note that on mobile this might require a user interaction first
                    const playPromise = audio.play();
                    
                    if (playPromise !== undefined) {
                      playPromise
                        .then(() => {
                          console.log("Audio playback started successfully");
                        })
                        .catch(error => {
                          console.error("Playback prevented by browser:", error);
                          // On mobile, autoplay might be prevented without user interaction
                          // We could show a visual indicator that there's a notification instead
                        });
                    }
                  } catch (soundError) {
                    console.error("Error playing notification sound:", soundError);
                  }
                }
                
                if (shouldShowToasts) {
                  toast({
                    title: data.data.title,
                    description: data.data.message,
                    duration: 5000,
                  });
                }
                
                // Update notifications in the cache
                queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                
                // For mobile notifications, also show a mobile notification if browser supports it
                if (data.data.type === "reminder" && "Notification" in window) {
                  try {
                    // Check if we have permission to show notifications
                    if (Notification.permission === "granted") {
                      // Create and show the notification
                      const notification = new Notification(data.data.title, {
                        body: data.data.message,
                        icon: "/notification-icon.png" // Add your notification icon
                        // Note: 'vibrate' is available in the specification but not all browsers support it
                        // It will be ignored on unsupported browsers
                      });
                      
                      // Handle notification click
                      notification.onclick = () => {
                        window.focus();
                        notification.close();
                      };
                    } 
                    // If we don't have permission and it hasn't been denied, request it
                    else if (Notification.permission !== "denied") {
                      Notification.requestPermission().then(permission => {
                        if (permission === "granted") {
                          // If permission was just granted, show the notification
                          const notification = new Notification(data.data.title, {
                            body: data.data.message,
                            icon: "/notification-icon.png"
                          });
                          
                          notification.onclick = () => {
                            window.focus();
                            notification.close();
                          };
                        }
                      });
                    }
                  } catch (notificationError) {
                    console.error("Error showing browser notification:", notificationError);
                  }
                }
              } else {
                console.warn("Received notification message without data payload");
              }
              break;
            
            case "auth_success":
              console.log("WebSocket authentication successful");
              break;
              
            case "error":
              console.error("WebSocket error message received:", data.message);
              break;
            
            case "connected":
              console.log("WebSocket connection confirmed by server");
              break;
              
            default:
              console.log("Received unknown WebSocket message type:", data.type, data);
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
          try {
            // Try to log some raw data for debugging
            if (typeof event.data === 'string') {
              const preview = event.data.length > 100 
                ? event.data.substring(0, 100) + "..." 
                : event.data;
              console.error("Raw message data preview:", preview);
            }
          } catch (logError) {
            console.error("Could not log raw message data:", logError);
          }
        }
      };

      socket.onclose = (event) => {
        console.log("WebSocket connection closed at", new Date().toISOString(), 
                    "with code:", event.code, "reason:", event.reason || "No reason provided");
        setConnectionStatus("disconnected");
        
        // Special handling for abnormal closure (1006) - this is common in production environments 
        // due to proxies, load balancers, or network issues
        const isAbnormalClosure = event.code === 1006;
        if (isAbnormalClosure) {
          console.warn("Abnormal WebSocket closure (1006) detected - likely a network/proxy issue");
        }
        
        // Always attempt to reconnect, regardless of the closure reason
        // Just use a more aggressive reconnect for abnormal closures
        if (reconnectAttempts.current < maxReconnectAttempts) {
          // Use a shorter delay for abnormal closures
          const baseDelay = isAbnormalClosure ? 1000 : 2000;
          const maxDelay = isAbnormalClosure ? 10000 : 30000;
          
          // Calculate delay with exponential backoff
          const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts.current), maxDelay);
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1} of ${maxReconnectAttempts})`);
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else {
          console.error(`Max reconnect attempts (${maxReconnectAttempts}) reached. Please reload the page.`);
          
          // Optional - reset attempt counter after a longer delay to try again
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("Resetting WebSocket reconnection attempts counter");
            reconnectAttempts.current = 0;
            connectWebSocket();
          }, 60000); // Try again after 1 minute
        }
      };

      socket.onerror = (event) => {
        // The WebSocket error event doesn't provide error details in most browsers due to security concerns
        console.error("WebSocket error occurred at", new Date().toISOString());
        console.error("Error event details (may be limited):", event);
        
        // Try to get additional diagnostics
        try {
          console.log("Current WebSocket readyState:", 
            socketRef.current?.readyState === WebSocket.CONNECTING ? "CONNECTING" :
            socketRef.current?.readyState === WebSocket.OPEN ? "OPEN" :
            socketRef.current?.readyState === WebSocket.CLOSING ? "CLOSING" : 
            socketRef.current?.readyState === WebSocket.CLOSED ? "CLOSED" : "UNKNOWN"
          );
          
          console.log("Network status: Online =", navigator.onLine);
          
          // Perform a simple check to see if the server is reachable
          fetch('/api/ping')
            .then(async response => {
              console.log("Server ping response:", response.status, response.statusText);
              
              // Handle both success and error status codes
              if (response.ok) {
                try {
                  // Try to parse the response as JSON, but handle text responses too
                  const contentType = response.headers.get('content-type');
                  if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log("Server ping JSON data:", data);
                  } else {
                    const text = await response.text();
                    console.log("Server ping text response:", text.substring(0, 100) + (text.length > 100 ? '...' : ''));
                  }
                } catch (parseError) {
                  console.error("Error parsing ping response:", parseError);
                }
              } else {
                // For non-200 responses, try to get the text content
                try {
                  const errorText = await response.text();
                  console.error("Server ping error response:", errorText.substring(0, 100) + (errorText.length > 100 ? '...' : ''));
                } catch (textError) {
                  console.error("Could not read error text:", textError);
                }
              }
            })
            .catch(err => {
              console.error("Server ping network failed:", err.message);
            });
        } catch (diagnosticError) {
          console.error("Error getting additional diagnostics:", diagnosticError);
        }
        
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