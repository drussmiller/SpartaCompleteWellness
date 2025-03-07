
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

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
        const response = await apiRequest(
          "GET", 
          `/api/posts/counts?tzOffset=${tzOffset}&date=${encodeURIComponent(dateKey)}`
        );
        
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(`Failed to fetch post limits: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
        }
        
        const result = await response.json();
        console.log("Post counts result:", result);
        return result;
      } catch (err) {
        console.error("API GET request to /api/posts/counts failed:", err);
        throw err;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnMount: true,
    retry: 2
  });

  // Force a refetch when component mounts
  useEffect(() => {
    if (user) {
      refetch();
    }
  }, [refetch, user, dateKey]);

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
