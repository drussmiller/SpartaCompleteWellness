import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";

export function usePostLimits(date: Date = new Date()) {
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  // Format date for the query key to ensure it refreshes when the date changes
  const dateKey = date.toISOString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/posts/counts", dateKey, tzOffset],
    queryFn: async () => {
      try {
        const response = await apiRequest(
          "GET", 
          `/api/posts/counts?tzOffset=${tzOffset}&date=${encodeURIComponent(dateKey)}`
        );
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(`Failed to fetch post limits: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
        }
        return response.json();
      } catch (err) {
        console.error("API GET request to /api/posts/counts?tzOffset=" + tzOffset + "&date=" + dateKey + " threw an exception:", err);
        throw err;
      }
    },
    enabled: true,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 3
  });

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

  return {
    counts: data?.counts || defaultCounts,
    canPost: data?.canPost || defaultCanPost,
    remaining: data?.remaining || defaultRemaining,
    isLoading,
    error,
    refetch
  };
}