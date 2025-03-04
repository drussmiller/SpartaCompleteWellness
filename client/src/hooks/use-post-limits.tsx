import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

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
}

export function usePostLimits() {
  const { user } = useAuth();
  const { data } = useQuery<PostLimitsResponse>({
    queryKey: ["/api/posts/limits"],
    enabled: !!user,
    queryFn: async () => {
      console.log('Fetching post limits for user:', user?.id);

      // Get local timezone offset in minutes
      const tzOffset = new Date().getTimezoneOffset();
      const res = await apiRequest("GET", `/api/posts/counts?tzOffset=${tzOffset}`);
      if (!res.ok) {
        throw new Error('Failed to fetch post limits');
      }
      const data = await res.json();
      console.log('Post limits response:', data);
      return data;
    },
    staleTime: 30000, // Refetch after 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  // Log the current state
  if (data) {
    console.log('Current post counts for user', user?.id, ':', data.counts);
    console.log('Can post status:', data.canPost);

    // Log each type of post count
    Object.entries(data.counts).forEach(([type, count]) => {
      console.log(`${type} posts: ${count} used`);
    });
  }

  // Define default post limits based on the application rules
  const defaultCanPost = {
    food: true,
    workout: true,
    scripture: true,
    memory_verse: new Date().getDay() === 6 // Only on Saturday
  };

  return {
    counts: data?.counts || {
      food: 0,
      workout: 0,
      scripture: 0,
      memory_verse: 0
    },
    canPost: data?.canPost || defaultCanPost,
    isSaturday: new Date().getDay() === 6
  };
}