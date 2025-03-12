const postQueryKey = ["/api/posts", postId];

  // Fetch the individual post data
  const { data: post, isLoading: isPostLoading } = useQuery({
    queryKey: postQueryKey,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/posts/${postId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch post: ${response.status}`);
        }
        return response.json();
      } catch (error) {
        console.error("Error fetching post:", error);
        throw error;
      }
    },
    enabled: !!postId,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: Infinity // Never consider data stale
  });