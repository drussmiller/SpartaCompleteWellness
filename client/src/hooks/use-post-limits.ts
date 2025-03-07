
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
}

export function usePostLimits(selectedDate: Date = new Date()) {
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
    // Set a shorter stale time to ensure more frequent refreshes
    staleTime: 5000, 
    // Enable automatic refetching when the component regains focus
    refetchOnWindowFocus: true,
    // Enable refetching when component remounts
    refetchOnMount: true
  });

  return {
    counts: data?.counts || { food: 0, workout: 0, scripture: 0, memory_verse: 0 },
    canPost: data?.canPost || { food: true, workout: true, scripture: true, memory_verse: false },
    remaining: data?.remaining || { food: 3, workout: 1, scripture: 1, memory_verse: 1 },
    refetch,
    isLoading
  };
}
