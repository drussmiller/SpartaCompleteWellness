import { createDirectDownloadUrl } from '../../lib/object-storage-utils';

const postQueryKey = ["/api/posts", postId];

// Helper function to process media URLs
const processMediaUrl = (post: any) => {
  if (post?.mediaUrl) {
    post.mediaUrl = createDirectDownloadUrl(post.mediaUrl);
  }
  return post;
};

  // Fetch the individual post data
  const { data: post, isLoading: isPostLoading } = useQuery({
    queryKey: postQueryKey,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", `/api/posts/${postId}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch post: ${response.status}`);
        }
        const data = await response.json();
        if (data?.mediaUrl) {
          const { createDirectDownloadUrl } = await import('../../lib/object-storage-utils');
          data.mediaUrl = createDirectDownloadUrl(data.mediaUrl);
        }
        return data;
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