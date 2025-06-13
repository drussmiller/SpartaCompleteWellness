
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useMemo, useEffect } from "react";
import { useAuth } from "./use-auth";

export interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
}

export function usePostLimits(date: Date = new Date()) {
  const { user } = useAuth();
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  // Format date for the query key to ensure it refreshes when the date changes
  const dateKey = date.toISOString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/posts/counts", dateKey, tzOffset],
    queryFn: async () => {
      try {
        console.log("Fetching post counts for date:", dateKey);
        
        // Set up timeout to avoid hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await apiRequest(
            "GET", 
            `/api/posts/counts?tzOffset=${tzOffset}&date=${encodeURIComponent(dateKey)}`,
            undefined,
            { signal: controller.signal }
          );
          
          // Clear timeout since request completed
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            // Try to get error details if available
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch post limits: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
          }
          
          const result = await response.json();
          console.log("Post counts result:", result);
          return result;
        } catch (fetchError) {
          // Clean up timeout if fetch throws
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            console.warn('Post counts request timed out');
            // Return the last known good data instead of failing
            const lastData = queryClient.getQueryData(["/api/posts/counts", dateKey, tzOffset]);
            if (lastData) {
              return lastData;
            }
            throw new Error('Request timed out');
          }
          
          throw fetchError;
        }
      } catch (err) {
        console.error("API GET request to /api/posts/counts failed:", err);
        // For network errors, just log but don't crash the UI
        if (err instanceof Error && (err.message.includes('Failed to fetch') || err.message.includes('Network Error'))) {
          console.warn('Using fallback data due to network error');
          return {
            counts: defaultCounts,
            canPost: defaultCanPost,
            remaining: defaultRemaining
          };
        }
        throw err;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes - reduce staleness checks
    refetchOnWindowFocus: false, // Don't refetch on focus to reduce updates
    refetchInterval: false, // Disable polling to prevent constant updates
    refetchOnMount: false, // Don't refetch on mount if data exists
    retry: 1,
    retryDelay: 2000
  });

  // Only refetch when user changes, not on every mount
  useEffect(() => {
    if (user && !data) {
      refetch();
    }
  }, [user]); // Remove dateKey and refetch dependencies

  // Default values
  const defaultCounts = {
    food: 0,
    workout: 0,
    scripture: 0,
    memory_verse: 0
  };

  const defaultCanPost = {
    food: true,
    workout: true,
    scripture: true,
    memory_verse: date.getDay() === 6 // Only available on Saturday
  };

  const defaultRemaining = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: date.getDay() === 6 ? 1 : 0
  };

  // Log the actual values we're returning
  const counts = data?.counts || defaultCounts;
  const canPost = data?.canPost || defaultCanPost;
  const remaining = data?.remaining || defaultRemaining;
  
  console.log("usePostLimits hook returning:", { 
    counts, canPost, remaining, 
    food_count: counts.food,
    food_remaining: remaining.food 
  });

  return {
    counts,
    canPost,
    remaining,
    isLoading,
    error,
    refetch
  };
}
