import { useEffect, useRef, useState } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';
import { queryClient } from '@/lib/queryClient';

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!user?.id) {
      console.log('No authenticated user found, skipping WebSocket connection');
      return;
    }

    console.log('Initializing WebSocket connection for user:', user.id);

    // Construct WebSocket URL with auth info
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;

    console.log('Attempting WebSocket connection to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectionStatus('connecting');

    // Connection opened
    ws.addEventListener('open', (event) => {
      console.log('WebSocket connection established successfully');
      setConnectionStatus('connected');

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
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Failed to connect to notification service"
      });
    });

    // Connection closed
    ws.addEventListener('close', (event) => {
      console.log('WebSocket connection closed:', event);
      setConnectionStatus('disconnected');
    });

    // Cleanup on unmount or when user changes
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      setConnectionStatus('disconnected');
    };
  }, [user?.id, toast]); // Only recreate connection when user ID changes

  return { connectionStatus };
}