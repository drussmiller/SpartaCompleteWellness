
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useCommentCount(postId: number) {
  return useQuery({
    queryKey: [`/api/posts/comments/${postId}`],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          console.error(`Error fetching comment count for post ${postId}:`, res.status, res.statusText);
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
    keepPreviousData: true,
    // Disable refetch on window focus to reduce server load
    refetchOnWindowFocus: false,
    // Disable request during SSR
    enabled: typeof window !== 'undefined' && !!postId
  });
}
