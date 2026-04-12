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
    miscellaneous: boolean;
  };
  remaining: PostLimits;
  memoryVerseWeekCount?: number;
  foodWeekPoints?: number;
  foodWeekCount?: number;
  workoutWeekPoints?: number;
  workoutWeekCount?: number;
}

export function usePostLimits(selectedDate?: Date) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Create a stable date that only changes once per day
  const stableDate = useMemo(() => {
    if (selectedDate) return selectedDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for consistency
    return today;
  }, [selectedDate]);
  
  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);
  const queryKey = useMemo(() => ["/api/posts/counts", stableDate.toISOString(), tzOffset], [stableDate, tzOffset]);

  const { data, refetch, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiRequest(
        "GET", 
        `/api/posts/counts?tzOffset=${tzOffset}&date=${stableDate.toISOString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch post limits");
      }
      const result = await response.json();
      return result as PostLimitsResponse;
    },
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false, // Disable automatic polling completely
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
  }, [user, queryClient]);

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
    memory_verse: stableDate.getDay() === 6,
    miscellaneous: true, // Added miscellaneous post type
    prayer: true // Always allow prayer requests
  };

  const defaultRemaining = {
    food: 3,
    workout: 1,
    scripture: 1,
    memory_verse: stableDate.getDay() === 6 ? 1 : 0,
    miscellaneous: Infinity, // Added miscellaneous post type; unlimited
    prayer: Infinity // Unlimited prayer requests
  };

  // Check if we have valid data from the API before using defaults
  const counts = data?.counts || defaultCounts;
  const memoryVerseWeekCount = data?.memoryVerseWeekCount || 0;
  const dayOfWeek = stableDate.getDay();

  // Food weekly cap logic
  const foodWeekPoints = data?.foodWeekPoints || 0;
  const foodWeekPointsCap = 54;
  const foodWeekPointsRemaining = Math.max(0, foodWeekPointsCap - foodWeekPoints);
  const foodWeekPostsRemaining = Math.floor(foodWeekPointsRemaining / 3);

  let canPostFood: boolean;
  let foodRemaining: number;

  if (foodWeekPoints >= foodWeekPointsCap) {
    canPostFood = false;
    foodRemaining = 0;
  } else if (dayOfWeek === 0) {
    const sundayMax = Math.min(3, foodWeekPostsRemaining);
    canPostFood = counts.food < sundayMax;
    foodRemaining = Math.max(0, sundayMax - counts.food);
  } else {
    const dailyMax = Math.min(3, foodWeekPostsRemaining);
    canPostFood = counts.food < dailyMax;
    foodRemaining = Math.max(0, dailyMax - counts.food);
  }

  // Workout weekly cap logic: Mon-Fri regular (1/day), Sat/Sun makeup days
  const workoutWeekPoints = data?.workoutWeekPoints || 0;
  const workoutWeekPointsCap = 15;
  const workoutWeekPointsRemaining = Math.max(0, workoutWeekPointsCap - workoutWeekPoints);
  const workoutWeekPostsRemaining = Math.floor(workoutWeekPointsRemaining / 3);

  let canPostWorkout: boolean;
  let workoutRemaining: number;

  if (workoutWeekPoints >= workoutWeekPointsCap) {
    canPostWorkout = false;
    workoutRemaining = 0;
  } else if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Sat/Sun: makeup days — 1 per day, capped by weekly remaining
    const makeupMax = Math.min(1, workoutWeekPostsRemaining);
    canPostWorkout = counts.workout < makeupMax;
    workoutRemaining = Math.max(0, makeupMax - counts.workout);
  } else {
    // Mon-Fri: 1 per day, capped by weekly remaining
    const dailyMax = Math.min(1, workoutWeekPostsRemaining);
    canPostWorkout = counts.workout < dailyMax;
    workoutRemaining = Math.max(0, dailyMax - counts.workout);
  }

  const canPost = {
    food: canPostFood,
    workout: canPostWorkout,
    scripture: counts.scripture < 1,
    memory_verse: memoryVerseWeekCount === 0,
    miscellaneous: true,
    prayer: true
  };
  const remaining = {
    food: foodRemaining,
    workout: workoutRemaining,
    scripture: Math.max(0, 1 - counts.scripture),
    memory_verse: (stableDate.getDay() === 6) ? Math.max(0, 1 - counts.memory_verse) : 0,
    miscellaneous: null,
    prayer: null
  };

  // Force a clean fetch of the data when the date changes
  useEffect(() => {
    if (user) {
      // Clear the cache for this query and fetch fresh data
      queryClient.removeQueries({ queryKey });
      refetch();
    }
  }, [stableDate.toISOString(), user, queryClient]);

  // Temporarily disable logging to reduce noise
  // console.log("Post limits updated:", {
  //   date: stableDate.toISOString(),
  //   counts,
  //   canPost,
  //   remaining
  // });

  return {
    counts,
    canPost,
    remaining,
    isLoading,
    error,
    refetch,
    memoryVerseWeekCount,
    foodWeekPoints,
    workoutWeekPoints
  };
}