import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useCommentCount(postId: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/posts/comments/${postId}/count`],
    queryFn: async () => {
      try {
        // Skip invalid postIds to prevent errors
        if (!postId || isNaN(Number(postId)) || Number(postId) <= 0) {
          console.warn(`Invalid post ID for comment count: ${postId}`);
          return { count: 0 };
        }

        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          console.warn(`Comment count request for post ${postId} failed with status ${res.status}`);
          return { count: 0 };
        }
        const comments = await res.json();
        // The API returns an array of comments, so we use the length as the count
        return { count: Array.isArray(comments) ? comments.length : 0 };
      } catch (error) {
        console.error(`Error fetching comment count for post ${postId}:`, error);
        // Return a default value instead of throwing
        return { count: 0 };
      }
    },
    // Don't retry too aggressively
    retry: 1,
    // Cache results longer to reduce request frequency
    staleTime: 120000, // 2 minutes
    // Use previous data if available
    keepPreviousData: true,
    // Disable all automatic refetching
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: "if-stale",
    // Disable request during SSR
    enabled: typeof window !== 'undefined' && !!postId
  });

  return {
    count: data?.count ?? 0,
    isLoading,
    error
  };
}