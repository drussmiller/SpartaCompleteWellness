
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
  
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["/api/posts/counts", selectedDate.toISOString(), tzOffset],
    queryFn: async () => {
      const response = await apiRequest(
        "GET", 
        `/api/posts/counts?tzOffset=${tzOffset}&date=${selectedDate.toISOString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch post limits");
      }
      return response.json();
    },
    // Shorter stale time for more frequent refreshes
    staleTime: 5000, 
    // Enable automatic refetching when the component regains focus
    refetchOnWindowFocus: true,
    // Enable refetching when component remounts
    refetchOnMount: true,
    enabled: !!user
  });

  // Force refresh the data whenever the component using this hook mounts
  useEffect(() => {
    if (user) {
      refetch();
      
      // Set up an interval to refresh counts every 10 seconds
      const intervalId = setInterval(() => {
        refetch();
      }, 10000);
      
      return () => clearInterval(intervalId);
    }
  }, [refetch, user]);

  // Define default post limits based on the application rules
  const defaultLimits = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: 1
  };

  // Use server-provided remaining values when available
  return {
    counts: data?.counts || { food: 0, workout: 0, scripture: 0, memory_verse: 0 },
    canPost: data?.canPost || { 
      food: true, 
      workout: true, 
      scripture: true, 
      memory_verse: selectedDate.getDay() === 6 // Only on Saturday
    },
    // Use the server-calculated remaining posts
    remaining: data?.remaining || defaultLimits,
    refetch,
    isLoading,
    isSaturday: selectedDate.getDay() === 6
  };
}
