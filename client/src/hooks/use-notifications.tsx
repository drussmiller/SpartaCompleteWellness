import { useEffect } from 'react';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    console.log('Setting up WebSocket connection for user:', user.id);
    
    // Create WebSocket connection
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?userId=${user.id}`);

    // Connection opened
    ws.addEventListener('open', (event) => {
      console.log('WebSocket connection established');
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
      } catch (error) {
        console.error('Error processing notification:', error);
      }
    });

    // Handle connection errors
    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Connection closed
    ws.addEventListener('close', (event) => {
      console.log('WebSocket connection closed:', event);
    });

    // Cleanup on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [user, toast]);
}
