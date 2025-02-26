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
      const res = await apiRequest("GET", "/api/posts/limits");
      return res.json();
    }
  });

  return {
    counts: data?.counts || {
      food: 0,
      workout: 0,
      scripture: 0,
      memory_verse: 0
    },
    canPost: data?.canPost || {
      food: false,
      workout: false,
      scripture: false,
      memory_verse: false
    },
    isSaturday: new Date().getDay() === 6
  };
}