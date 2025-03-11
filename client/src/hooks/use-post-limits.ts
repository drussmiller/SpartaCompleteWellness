
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

      return () => {
        window.removeEventListener('post-mutation', handlePostChange);
        window.removeEventListener('post-counts-changed', handlePostChange);
      };
    }
  }, [user, queryClient, queryKey]);

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
    memory_verse: selectedDate.getDay() === 6
  };

  const defaultRemaining = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: selectedDate.getDay() === 6 ? 1 : 0
  };

  // Check if we have valid data from the API before using defaults
  const counts = data?.counts || defaultCounts;
  const canPost = data?.canPost || defaultCanPost;
  const remaining = data?.remaining || defaultRemaining;

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
    refetch
  };
}
