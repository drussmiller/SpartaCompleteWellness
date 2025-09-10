import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useCommentCount(postId: number) {
  const [count, setCount] = useState(0);
  const prevCountRef = useRef(0);
  const eventListenerAddedRef = useRef(false);

  // Define the function that will handle comment count updates
  useEffect(() => {
    if (!postId || eventListenerAddedRef.current) return;

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

    // Add the event listener only once
    window.addEventListener('commentCountUpdate', handleCommentCountUpdate as EventListener);
    eventListenerAddedRef.current = true;

    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('commentCountUpdate', handleCommentCountUpdate as EventListener);
      eventListenerAddedRef.current = false;
    };
  }, [postId]);

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
        const commentCount = Array.isArray(comments) ? comments.length : 0;

        console.log(`Fetched ${commentCount} comments for post ${postId}`);
        return { count: commentCount };
      } catch (error) {
        console.error(`Error fetching comment count for post ${postId}:`, error);
        return { count: 0 };
      }
    },
    enabled: Boolean(postId && !isNaN(Number(postId)) && Number(postId) > 0),
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
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