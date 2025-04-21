import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from 'react';

export function useCommentCount(postId: number) {
  const [count, setCount] = useState(0);
  const prevCountRef = useRef(0);
  const queryClient = useQueryClient();

  // Subscribe to comment events using a custom event listener
  useEffect(() => {
    if (!postId) return;

    // Define the function that will handle comment count updates
    const handleCommentCountUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.postId === postId) {
        // If we have a direct count update, use it
        if (typeof event.detail.count === 'number') {
          setCount(event.detail.count);
          prevCountRef.current = event.detail.count;
          
          // Also update the query cache for consistency
          queryClient.setQueryData([`/api/posts/comments/${postId}/count`], { 
            count: event.detail.count 
          });
          
          console.log(`Updated comment count for post ${postId} to ${event.detail.count} from event`);
        } 
        // If we just have an increment signal, increment the current count
        else if (event.detail.increment) {
          const newCount = prevCountRef.current + 1;
          setCount(newCount);
          prevCountRef.current = newCount;
          
          // Also update the query cache for consistency
          queryClient.setQueryData([`/api/posts/comments/${postId}/count`], { 
            count: newCount 
          });
          
          console.log(`Incremented comment count for post ${postId} to ${newCount} from event`);
        }
      }
    };

    // Add the event listener
    window.addEventListener('commentCountUpdate', handleCommentCountUpdate as EventListener);

    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('commentCountUpdate', handleCommentCountUpdate as EventListener);
    };
  }, [postId, queryClient]);

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
    // We use placeholderData instead of keepPreviousData in React Query v5
    placeholderData: prevData => prevData,
    // Enable automatic refetching on window focus
    refetchOnWindowFocus: true,
    // Poll for updates more frequently
    refetchInterval: 15000, // 15 seconds
    // Always refetch when component mounts
    refetchOnMount: true,
    // Disable request during SSR
    enabled: typeof window !== 'undefined' && !!postId
  });

  // Only update the count state if the count has changed from query data
  useEffect(() => {
    if (data?.count !== undefined && data?.count !== prevCountRef.current) {
      setCount(data.count);
      prevCountRef.current = data.count;
      console.log(`Updated comment count for post ${postId} to ${data.count} from query`);
    }
  }, [data, postId]);

  return {
    count: count,
    isLoading,
    error,
    // Add a manual increment function that components can call directly
    incrementCount: () => {
      const newCount = prevCountRef.current + 1;
      setCount(newCount);
      prevCountRef.current = newCount;
      
      // Update the query cache
      queryClient.setQueryData([`/api/posts/comments/${postId}/count`], { 
        count: newCount 
      });
      
      // Dispatch an event so other components with the same postId can update
      window.dispatchEvent(new CustomEvent('commentCountUpdate', {
        detail: { postId, count: newCount }
      }));
      
      console.log(`Manually incremented comment count for post ${postId} to ${newCount}`);
    }
  };
}