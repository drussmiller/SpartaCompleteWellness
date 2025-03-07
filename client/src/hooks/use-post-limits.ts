
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
      console.log("Fetching post counts for date:", selectedDate.toISOString());
      const response = await apiRequest(
        "GET", 
        `/api/posts/counts?tzOffset=${tzOffset}&date=${selectedDate.toISOString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch post limits");
      }
      const result = await response.json();
      console.log("Post limits API response:", result);
      return result as PostLimitsResponse;
    },
    // Get fresh data but not too frequently
    staleTime: 2000, // Data is fresh for 2 seconds
    cacheTime: 60000, // Keep in cache for 1 minute
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 5000, // Refetch every 5 seconds
    retry: 2,
    enabled: !!user
  });

  // Force immediate refresh on mount and register listener for post changes
  useEffect(() => {
    if (user) {
      console.log("Setting up post limits refresh for date:", selectedDate.toISOString());
      
      // Force immediate refetch when hook is used
      const fetchData = async () => {
        try {
          console.log("Invalidating post counts cache and fetching fresh data");
          // Force invalidate by cache key pattern
          await queryClient.invalidateQueries({
            predicate: (query) => query.queryKey[0] === "/api/posts/counts"
          });
          // Then fetch fresh data
          const result = await refetch();
          console.log("Fresh post limits data:", result.data);
        } catch (error) {
          console.error("Error refreshing post limits:", error);
        }
      };
      
      fetchData();
      
      // Listen for global events when posts are modified
      const handlePostChange = () => {
        console.log("Post mutation detected, refreshing post limits");
        fetchData();
      };
      
      // Add event listener for post mutations
      window.addEventListener('post-mutation', handlePostChange);
      
      // Also set up interval for periodic refresh as backup
      const intervalId = setInterval(() => {
        fetchData();
      }, 5000); // Refresh every 5 seconds
      
      return () => {
        window.removeEventListener('post-mutation', handlePostChange);
        clearInterval(intervalId);
      };
    }
  }, [user, selectedDate, refetch, queryClient, queryKey]);

  // Default values when data is not available
  const defaultCanPost = {
    food: true,
    workout: true,
    scripture: true,
    memory_verse: selectedDate.getDay() === 6 // Only on Saturday
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

  // Log what we're returning for debugging
  console.log("usePostLimits hook returning:", { 
    counts: data?.counts || defaultCounts,
    canPost: data?.canPost || defaultCanPost,
    remaining: data?.remaining || defaultRemaining,
    isLoading
  });

  return {
    counts: data?.counts || defaultCounts,
    canPost: data?.canPost || defaultCanPost,
    remaining: data?.remaining || defaultRemaining,
    refetch: () => {
      // Invalidate and refetch in one operation
      queryClient.invalidateQueries({ queryKey });
      return refetch();
    },
    isLoading,
    isSaturday: selectedDate.getDay() === 6
  };
}
