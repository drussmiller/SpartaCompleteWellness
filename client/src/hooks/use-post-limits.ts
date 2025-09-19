import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo } from "react";

export interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
  miscellaneous: number; // Added miscellaneous post type
}

interface PostLimitsResponse {
  counts: PostLimits;
  canPost: {
    food: boolean;
    workout: boolean;
    scripture: boolean;
    memory_verse: boolean;
    miscellaneous: boolean; // Added miscellaneous post type
  };
  remaining: PostLimits;
}

export function usePostLimits(selectedDate: Date = new Date()) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);
  const queryKey = useMemo(() => ["/api/posts/counts", selectedDate.toISOString(), tzOffset], [selectedDate, tzOffset]);

  const { data, refetch, isLoading, error } = useQuery({
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
      return result as PostLimitsResponse;
    },
    staleTime: 300000, // 5 minutes
    cacheTime: 600000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: null, // Disable automatic polling completely
    retry: 1,
    enabled: !!user
  });

  useEffect(() => {
    if (user) {
      const handlePostChange = () => {
        console.log("Post change detected, invalidating post counts");
        // Forcefully invalidate the query
        queryClient.invalidateQueries({ queryKey });
        refetch();
      };

      window.addEventListener('post-mutation', handlePostChange);
      window.addEventListener('post-counts-changed', handlePostChange);

      console.log('Post limit event listeners attached');

      return () => {
        window.removeEventListener('post-mutation', handlePostChange);
        window.removeEventListener('post-counts-changed', handlePostChange);
      };
    }
  }, [user, queryClient, refetch]);

  const defaultCounts = {
    food: 0,
    workout: 0,
    scripture: 0,
    memory_verse: 0,
    miscellaneous: 0, // Added miscellaneous post type
    prayer: 0 // Added prayer requests
  };

  const defaultCanPost = {
    food: true,
    workout: true,
    scripture: true,
    memory_verse: selectedDate.getDay() === 6,
    miscellaneous: true, // Added miscellaneous post type
    prayer: true // Always allow prayer requests
  };

  const defaultRemaining = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: selectedDate.getDay() === 6 ? 1 : 0,
    miscellaneous: Infinity, // Added miscellaneous post type; unlimited
    prayer: Infinity // Unlimited prayer requests
  };

  // Check if we have valid data from the API before using defaults
  const counts = data?.counts || defaultCounts;
  const memoryVerseWeekCount = data?.memoryVerseWeekCount || 0;
  
  // Derive canPost from counts rather than using potentially stale data from API
  const canPost = {
    food: (selectedDate.getDay() !== 0) && (counts.food < 3),
    workout: counts.workout < 1,
    scripture: counts.scripture < 1,
    memory_verse: memoryVerseWeekCount === 0,
    miscellaneous: true, // Always allow miscellaneous posts
    prayer: true // Always allow prayer requests
  };
  const remaining = {
    food: Math.max(0, 3 - counts.food),
    workout: Math.max(0, 1 - counts.workout),
    scripture: Math.max(0, 1 - counts.scripture),
    memory_verse: (selectedDate.getDay() === 6) ? Math.max(0, 1 - counts.memory_verse) : 0,
    miscellaneous: null, // No limit
    prayer: null // No limit for prayer requests
  };

  // Force a clean fetch of the data when the date changes
  useEffect(() => {
    if (user) {
      // Clear the cache for this query and fetch fresh data
      queryClient.removeQueries({ queryKey });
      refetch();
    }
  }, [selectedDate.toISOString(), user, queryClient, refetch]);

  // Log post limits for debugging
  console.log("Post limits updated:", {
    date: selectedDate.toISOString(),
    counts,
    canPost,
    remaining
  });

  return {
    counts,
    canPost,
    remaining,
    isLoading,
    error,
    refetch,
    memoryVerseWeekCount
  };
}