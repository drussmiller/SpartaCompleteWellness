
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useCommentCount(postId: number) {
  return useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          const errorText = await res.text();
          console.error(`Error fetching comment count for post ${postId}:`, errorText);
          return { count: 0 };
        }
        return res.json();
      } catch (error) {
        console.error(`Error fetching comment count for post ${postId}:`, error);
        // Return a default value instead of throwing
        return { count: 0 };
      }
    },
    // Don't retry too aggressively
    retry: 1,
    // Cache results longer to reduce request frequency
    staleTime: 60000,
    // Use previous data if available
    keepPreviousData: true
  });
}
