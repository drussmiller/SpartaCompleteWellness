import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
}

interface PostLimitsResponse {
  counts: PostLimits;
  canPost: {
    food: boolean;
    workout: boolean;
    scripture: boolean;
    memory_verse: boolean;
  };
  remaining: PostLimits;
}

export function usePostLimits(selectedDate: Date = new Date()) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tzOffset = new Date().getTimezoneOffset();
  const queryKey = ["/api/posts/counts", selectedDate.toISOString(), tzOffset];

  const { data, refetch, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest(
        "GET", 
        `/api/posts/counts?tzOffset=${tzOffset}&date=${selectedDate.toISOString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch post limits");
      }
      const result = await response.json();
      // Remove console logging of API response data
      return result as PostLimitsResponse;
    },
    // Get fresh data but not too frequently
    staleTime: 15000, // Data is fresh for 15 seconds
    cacheTime: 60000, // Keep in cache for 1 minute
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1, // Only retry once
    enabled: !!user
  });

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        // Force a hard reset of the cache for post counts
        queryClient.resetQueries({ 
          queryKey: ["/api/posts/counts"]
        });

        // Invalidate all other related queries
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });

        if (user?.teamId) {
          queryClient.invalidateQueries({ queryKey: ["/api/posts", user.teamId] });
        }

        // Dispatch a custom event to notify all components to refresh
        const event = new CustomEvent('post-counts-changed');
        window.dispatchEvent(event);

        // Force immediate refetch
        refetch();

        // Try again after a short delay to ensure server had time to process
        setTimeout(() => {
          refetch();
        }, 1000);
      };

      fetchData();

      const handlePostChange = () => {
        fetchData();
      };

      window.addEventListener('post-mutation', handlePostChange);

      const intervalId = setInterval(() => {
        fetchData();
      }, 30000); // Match the refetchInterval timing 

      return () => {
        window.removeEventListener('post-mutation', handlePostChange);
        clearInterval(intervalId);
      };
    }
  }, [user, selectedDate, refetch, queryClient, queryKey]);

  const defaultCanPost = {
    food: true,
    workout: true,
    scripture: true,
    memory_verse: selectedDate.getDay() === 6 
  };

  const defaultCounts = {
    food: 0,
    workout: 0,
    scripture: 0,
    memory_verse: 0
  };

  const defaultRemaining = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: selectedDate.getDay() === 6 ? 1 : 0
  };

  return {
    counts: data?.counts || defaultCounts,
    canPost: data?.canPost || defaultCanPost,
    remaining: data?.remaining || defaultRemaining,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey });
      return refetch();
    },
    isLoading,
    isSaturday: selectedDate.getDay() === 6
  };
}