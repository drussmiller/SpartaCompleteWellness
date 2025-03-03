import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 2000; // 2 seconds

  useEffect(() => {
    if (!user) {
      console.log('No authenticated user found, skipping WebSocket connection');
      return;
    }

    const connectWebSocket = () => {
      try {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('WebSocket already connected');
          return;
        }

        console.log('Initializing WebSocket connection for user:', user.id);

        // Ensure we're using the correct protocol and include credentials
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log('Attempting WebSocket connection to:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setConnectionStatus("connecting");

        ws.addEventListener('open', () => {
          console.log('WebSocket connection established successfully');
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;

          // Send authentication message immediately after connection
          ws.send(JSON.stringify({ 
            type: 'authenticate',
            userId: user.id
          }));
        });

        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);

            if (data.type === 'authenticated') {
              console.log('WebSocket authentication successful');
              return;
            }

            if (data.type === 'notification') {
              toast({
                title: data.title || 'New Notification',
                description: data.message,
              });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        });

        ws.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus("disconnected");
        });

        ws.addEventListener('close', (event) => {
          console.log('WebSocket connection closed:', event);
          setConnectionStatus("disconnected");
          wsRef.current = null;
          handleReconnect();
        });

      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        setConnectionStatus("disconnected");
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached');
        return;
      }

      reconnectAttemptRef.current++;
      console.log(`Reconnection attempt ${reconnectAttemptRef.current} of ${maxReconnectAttempts}`);

      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, reconnectDelay * Math.pow(2, reconnectAttemptRef.current - 1)); // Exponential backoff
    };

    connectWebSocket();

    return () => {
      console.log('Cleaning up WebSocket connection');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionStatus("disconnected");
    };
  }, [user, toast]); // Only recreate connection when user changes

  return { connectionStatus };
}