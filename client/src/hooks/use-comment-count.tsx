import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from 'react';

export function useCommentCount(postId: number) {
  const [count, setCount] = useState(0);
  const prevCountRef = useRef(0);

  const { data, isLoading, error } = useQuery({
    queryKey: [`/api/posts/comments/${postId}/count`],
    queryFn: async () => {
      try {
        // Skip invalid postIds to prevent errors
        if (!postId || isNaN(Number(postId)) || Number(postId) <= 0) {
          console.warn(`Invalid post ID for comment count: ${postId}`);
          return { count: 0 };
        }

        // Add explicit request headers to ensure expected response format
        const requestOptions = {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        };

        const res = await apiRequest("GET", `/api/posts/comments/${postId}`);
        if (!res.ok) {
          console.warn(`Comment count request for post ${postId} failed with status ${res.status}`);
          return { count: 0 };
        }

        try {
          // Add explicit JSON parsing error handling
          const comments = await res.json();
          
          // Validate response structure to prevent downstream errors
          if (!Array.isArray(comments)) {
            console.warn(`Comment response for post ${postId} is not an array`, comments);
            return { count: 0 };
          }
          
          return { count: comments.length };
        } catch (jsonError) {
          console.error(`JSON parsing error for post ${postId} comments:`, jsonError);
          return { count: 0 };
        }
      } catch (error) {
        console.error(`Error fetching comment count for post ${postId}:`, error);
        // Return a default value instead of throwing
        return { count: 0 };
      }
    },
    // Always retry at least once
    retry: 1,
    // Lower staleTime for more frequent updates
    staleTime: 5000, // 5 seconds
    // Use previous data if available
    keepPreviousData: true,
    // Enable automatic refetching on window focus
    refetchOnWindowFocus: true,
    // Poll for updates every 30 seconds
    refetchInterval: 30000,
    // Always refetch when component mounts
    refetchOnMount: true,
    // Disable request during SSR
    enabled: typeof window !== 'undefined' && !!postId
  });

  // Only update the count state if the count has changed
  useEffect(() => {
    if (data?.count !== prevCountRef.current) {
      setCount(data?.count ?? 0);
      prevCountRef.current = data?.count ?? 0;
    }
  }, [data]);

  return {
    count: count,
    isLoading,
    error
  };
}