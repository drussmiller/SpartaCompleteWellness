import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';

// Hook to get and manage unread prayer request count
export function usePrayerRequests() {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch unread prayer request count
  const fetchUnreadCount = async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/prayer-requests/unread', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch prayer request count: ${response.status}`);
      }

      const data = await response.json();
      setUnreadCount(data.unreadCount || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching prayer request count:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Mark prayer requests as viewed
  const markAsViewed = async () => {
    if (!isAuthenticated || unreadCount === 0) return;

    try {
      const response = await fetch('/api/prayer-requests/mark-viewed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to mark prayer requests as viewed: ${response.status}`);
      }

      // Reset count after successful update
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking prayer requests as viewed:', err);
    }
  };

  // Fetch unread count on mount and when auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    } else {
      setUnreadCount(0);
      setLoading(false);
    }
  }, [isAuthenticated]);

  return {
    unreadCount,
    loading,
    error,
    fetchUnreadCount,
    markAsViewed
  };
}