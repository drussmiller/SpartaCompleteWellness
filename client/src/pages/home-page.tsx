import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const [visiblePosts, setVisiblePosts] = useState<string[]>([]);
  const [olderPosts, setOlderPosts] = useState<Post[] | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Only refetch when actually needed
  useEffect(() => {
    if (user) {
      const lastRefetchTime = localStorage.getItem('lastPostLimitsRefetch');
      const now = Date.now();
      if (!lastRefetchTime || now - parseInt(lastRefetchTime) > 1800000) {
        refetchLimits();
        localStorage.setItem('lastPostLimitsRefetch', now.toString());
      }
    }
  }, [user, refetchLimits]);

  // Query for team information
  const { data: teamInfo } = useQuery({
    queryKey: ["/api/teams", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) return null;
      const response = await apiRequest("GET", `/api/teams/${user.teamId}`);
      if (!response.ok) throw new Error("Failed to fetch team info");
      return response.json();
    },
    enabled: !!user?.teamId
  });

  const { data: posts, isLoading, error } = useQuery<Post[]>({
    queryKey: ["/api/posts", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) {
        throw new Error("No team assigned - please contact your administrator");
      }
      try {
        const response = await apiRequest("GET", "/api/posts");
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to fetch posts: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid response format from server");
        }
        return data;
      } catch (err) {
        console.error("Error fetching posts:", err);
        throw err instanceof Error ? err : new Error("Failed to load posts");
      }
    },
    enabled: !!user,
    retry: 2,
    retryDelay: 1000,
    staleTime: 300000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false
  });

  useEffect(() => {
    if (posts && posts.length > 10) {
      setOlderPosts(posts.slice(10));
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const postId = entry.target.getAttribute('data-post-id');
            if (postId) {
              setVisiblePosts(prev => [...prev, postId]);
            }
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: '500px' });

      observerRef.current = observer;
    }
  }, [posts]);

  useEffect(() => {
    const observer = observerRef.current;
    if (olderPosts && observer) {
      const container = document.getElementById('older-posts-container');
      if (container) {
        olderPosts.forEach(post => {
          const existingElement = document.querySelector(`[data-post-id="${post.id}"]`);
          if (!existingElement && !visiblePosts.includes(post.id.toString())) {
            const element = document.createElement('div');
            element.setAttribute('data-post-id', post.id.toString());
            container.appendChild(element);
            observer.observe(element);
          }
        });
      }
    }
    return () => observer?.disconnect();
  }, [olderPosts, visiblePosts]);

  if (isLoading) {
    return (
      <AppLayout title="Home">
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Home">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error loading posts</h2>
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="px-6 pb-1 pt-2 flex items-center justify-between rounded-md m-2">
          <div className="flex-1 flex justify-center">
            <img
              src="/sparta_circle_red.png"
              alt="Sparta Complete Wellness Logo"
              className="w-3/5 h-auto mx-auto"
              onError={(e) => {
                console.error('Error loading logo:', e);
                e.currentTarget.src = '/fallback-logo.png';
              }}
            />
          </div>
          <CreatePostDialog remaining={remaining} />
        </div>
      </div>

      <main className="w-full">
        <div className="space-y-4">
          {posts ? (
            posts.length > 0 ? (
              <>
                {posts.slice(0, 10).map((post) => (
                  <ErrorBoundary key={post.id}>
                    <PostCard post={post} />
                  </ErrorBoundary>
                ))}

                <div className="space-y-4 mt-8">
                  <h2 className="text-lg font-semibold px-4">Older Posts</h2>
                  <div id="older-posts-container" className="space-y-4">
                    {visiblePosts.map(postId => {
                      const post = olderPosts?.find(p => p.id.toString() === postId);
                      if (!post) return null;
                      return (
                        <ErrorBoundary key={`lazy-post-${postId}`}>
                          <div className="px-4">
                            <PostCard post={post} />
                          </div>
                        </ErrorBoundary>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No posts yet. Be the first to share!
              </p>
            )
          ) : (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-40 bg-gray-100 rounded-md animate-pulse"></div>
              ))}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}