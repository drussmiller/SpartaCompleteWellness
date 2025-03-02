import { useEffect, useRef, useState } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';
import { queryClient } from '@/lib/queryClient';

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!user?.id) {
      console.log('No authenticated user found, skipping WebSocket connection');
      return;
    }

    const connectWebSocket = () => {
      try {
        console.log('Initializing WebSocket connection for user:', user.id);

        // Construct WebSocket URL with auth info
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;

        console.log('Attempting WebSocket connection to:', wsUrl);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('Closing existing connection before reconnecting');
          wsRef.current.close();
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setConnectionStatus('connecting');

        // Connection opened
        ws.addEventListener('open', () => {
          console.log('WebSocket connection established successfully');
          setConnectionStatus('connected');
          reconnectAttemptRef.current = 0; // Reset reconnect attempts on successful connection

          // Send a test message to verify connection
          try {
            ws.send(JSON.stringify({ type: 'connection_test', userId: user.id }));
          } catch (error) {
            console.error('Error sending test message:', error);
          }
        });

        // Listen for messages
        ws.addEventListener('message', (event) => {
          try {
            const notification = JSON.parse(event.data);
            console.log('Received notification:', notification);

            if (notification.type === 'connection_status') {
              console.log('Connection status update:', notification.status);
              return;
            }

            // Show toast notification
            toast({
              title: notification.title,
              description: notification.message,
            });

            // Invalidate notifications query to refresh the list
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } catch (error) {
            console.error('Error processing notification:', error);
          }
        });

        // Handle connection errors
        ws.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('disconnected');
          handleReconnect();
        });

        // Connection closed
        ws.addEventListener('close', (event) => {
          console.log('WebSocket connection closed:', event);
          setConnectionStatus('disconnected');
          handleReconnect();
        });
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        setConnectionStatus('disconnected');
        handleReconnect();
      }
    };

    const handleReconnect = () => {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        console.log('Max reconnection attempts reached');
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Failed to establish a stable connection to the notification service"
        });
        return;
      }

      reconnectAttemptRef.current++;
      console.log(`Attempting reconnection (${reconnectAttemptRef.current}/${maxReconnectAttempts})`);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Exponential backoff for reconnection attempts
      const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 10000);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, backoffDelay);
    };

    // Initial connection
    connectWebSocket();

    // Cleanup
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      setConnectionStatus('disconnected');
    };
  }, [user?.id, toast]); // Only recreate connection when user ID changes

  return { connectionStatus };
}