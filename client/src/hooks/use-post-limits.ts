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
    staleTime: 5000, // Data is fresh for 5 seconds
    cacheTime: 60000, // Keep in cache for 1 minute
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 10000, // Refetch every 10 seconds (further reduced)
    retry: 2,
    enabled: !!user
  });

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] === "/api/posts/counts"
        });
        await refetch();
      };

      fetchData();

      const handlePostChange = () => {
        fetchData();
      };

      window.addEventListener('post-mutation', handlePostChange);

      const intervalId = setInterval(() => {
        fetchData();
      }, 10000); 

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