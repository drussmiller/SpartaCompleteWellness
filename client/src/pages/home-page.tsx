import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary"; // Added import

export default function HomePage() {
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const [visibleLazyPosts, setVisibleLazyPosts] = useState([]);
  const [olderPosts, setOlderPosts] = useState<Post[] | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Only refetch when actually needed, not on every mount
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
    queryKey: ["/api/posts"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/posts");
        if (!response.ok) {
          throw new Error(`Failed to fetch posts: ${response.status} ${response.statusText}`);
        }
        return response.json();
      } catch (err) {
        console.error("Error fetching posts:", err);
        throw err;
      }
    },
    enabled: !!user,
    retry: 1,
    retryDelay: 2000,
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false
  });

  useEffect(() => {
    if (posts && posts.length > 10) {
      setOlderPosts(posts.slice(10));
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleLazyPosts(prev => [...prev, posts.slice(10)[prev.length]?.id.toString() || ""]);
            observer?.unobserve(entry.target);
          }
        });
      }, {rootMargin: '500px'});
      observerRef.current = observer;
    }
  }, [posts]);

  useEffect(() => {
    const lazyPostsContainer = document.getElementById('older-posts-container');
    if(olderPosts && lazyPostsContainer && observerRef.current) {
       olderPosts.slice(0, visibleLazyPosts.length).map(post => {
        const div = document.createElement('div')
        div.className = "px-4";
        div.id = `lazy-post-${post.id}`
        lazyPostsContainer.appendChild(div);
        observerRef.current.observe(div);
       })
    }
  }, [visibleLazyPosts, olderPosts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-destructive">
          <h2 className="text-xl font-bold mb-2">Error loading posts</h2>
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        {/* Title bar with logo and title */}
        <div className="px-6 pb-1 pt-2 flex flex-col items-center rounded-md m-2">
          <img
            src="/Sparta_Logo.jpg"
            alt="Sparta Logo"
            className="h-20 w-auto"
            onError={(e) => {
              console.error('Error loading logo:', e);
              e.currentTarget.src = '/fallback-logo.png';
            }}
          />
        </div>

        {/* Team name and Add Post button */}
        <div className="px-6 py-3 border-t border-border flex justify-between items-center">
          <div>
            <h2 className="text-sm text-muted-foreground">
              {teamInfo?.name || ""}
            </h2>
            {!user?.teamId && (
              <p className="text-sm text-muted-foreground mt-1">
                Join a team to start your journey
              </p>
            )}
          </div>
          <div className="scale-90">
            <CreatePostDialog remaining={remaining} />
          </div>
        </div>
      </div>

      <main className="p-4 max-w-2xl mx-auto w-full">
        <div className="space-y-4">
          {posts ? (
            posts.length > 0 ? (
              <>
                {/* Render only the first 10 posts directly */}
                {posts.slice(0, 10).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}

                {/* Older Posts */}
                <div className="space-y-4 mt-8">
                  <h2 className="text-lg font-semibold px-4">Older Posts</h2>
                  <div id="older-posts-container" className="space-y-4">
                    {visibleLazyPosts.map(postId => {
                      const post = olderPosts?.find(p => p.id.toString() === postId);
                      if (!post) return null;
                      return (
                        <div key={`lazy-post-${postId}`} className="px-4">
                          <ErrorBoundary fallback={<div>Error loading post</div>}>
                            <PostCard post={post} />
                          </ErrorBoundary>
                        </div>
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