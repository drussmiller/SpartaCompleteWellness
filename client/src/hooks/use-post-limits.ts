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
        // Use more specific query key to prevent widespread cache invalidation
        queryClient.invalidateQueries({ 
          queryKey: queryKey
        });
        
        // Avoid refetching too many additional queries
        queryClient.invalidateQueries({ 
          queryKey: ["/api/posts"],
          exact: false,
          refetchType: "inactive"
        });

        // Single refetch is enough
        await refetch();
      };

      // Initial fetch when component mounts
      fetchData();

      // Add event listener for post changes
      const handlePostChange = () => {
        queryClient.invalidateQueries({ queryKey });
      };

      window.addEventListener('post-mutation', handlePostChange);
      window.addEventListener('post-counts-changed', handlePostChange);
      
      // Use a less frequent interval to reduce server load
      const intervalId = setInterval(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 60000); // Reduced frequency to once per minute
      
      return () => {
        window.removeEventListener('post-mutation', handlePostChange);
        window.removeEventListener('post-counts-changed', handlePostChange);
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