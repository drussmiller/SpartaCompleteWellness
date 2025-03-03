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
    if (!user) {
      console.log('No authenticated user found, skipping WebSocket connection');
      return;
    }

    const connectWebSocket = () => {
      try {
        console.log('Initializing WebSocket connection');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log('Attempting WebSocket connection to:', wsUrl);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('Closing existing connection before reconnecting');
          wsRef.current.close();
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setConnectionStatus('connecting');

        ws.addEventListener('open', () => {
          console.log('WebSocket connection established successfully');
          setConnectionStatus('connected');
          reconnectAttemptRef.current = 0; // Reset reconnect attempts on successful connection
        });

        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);

            if (data.type === 'connected') {
              console.log('Connection confirmed with userId:', data.userId);
              return;
            }

            // Show toast notification for other messages
            toast({
              title: data.title || 'New Notification',
              description: data.message,
            });

            // Refresh notifications list
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        });

        ws.addEventListener('error', (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus('disconnected');
          handleReconnect();
        });

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
  }, [user, toast]); // Only recreate connection when user changes

  return { connectionStatus };
}