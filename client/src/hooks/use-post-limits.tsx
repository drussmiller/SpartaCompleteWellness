import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

interface PostLimits {
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

export function usePostLimits(date?: Date) {
  const { user } = useAuth();
  const { data, refetch } = useQuery<PostLimitsResponse>({
    queryKey: ["/api/posts/counts", date?.toISOString()],
    enabled: !!user,
    queryFn: async () => {
      console.log('Fetching post limits for user:', user?.id, 'date:', date ? date.toISOString() : 'current');

      // Get local timezone offset in minutes
      const tzOffset = new Date().getTimezoneOffset();
      let url = `/api/posts/counts?tzOffset=${tzOffset}`;
      
      // Add date parameter if provided
      if (date) {
        url += `&date=${date.toISOString()}`;
      }
      
      const res = await apiRequest("GET", url);
      if (!res.ok) {
        throw new Error('Failed to fetch post limits');
      }
      const data = await res.json();
      console.log('Post limits response:', data);
      return data;
    },
    staleTime: 0, // Always get fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    cacheTime: 0 // Don't cache the data
  });

  // Force refetch when date changes
  useEffect(() => {
    refetch();
  }, [date, refetch]);

  // Log the current state
  if (data) {
    console.log('Current post counts:', data.counts);
    console.log('Can post status:', data.canPost);
    console.log('Remaining posts:', data.remaining);
  }

  // Define default post limits based on the application rules
  const defaultLimits = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: 1
  };

  return {
    counts: data?.counts || {
      food: 0,
      workout: 0,
      scripture: 0,
      memory_verse: 0
    },
    canPost: data?.canPost || {
      food: true,
      workout: true,
      scripture: true,
      memory_verse: new Date().getDay() === 6 // Only on Saturday
    },
    remaining: data?.remaining || defaultLimits,
    isSaturday: new Date().getDay() === 6
  };
}