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
import { useRef, useEffect } from "react";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const loadingRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);

  // Only refetch post limits when needed
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

  const { data: posts = [], isLoading, error } = useQuery({
    queryKey: ["/api/posts"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/posts?page=1&limit=50`);
      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // Consider data stale after 1 minute
  });

  if (error) {
    return (
      <AppLayout>
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
      <div className="flex flex-col min-h-screen">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border md:pl-16">
          <div className="px-12 pb-1 pt-2 flex items-center justify-between rounded-md m-2">
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

        {/* Main Content Area - Keep mobile width on larger screens */}
        <main className="flex-1 mt-32 mb-20 w-full md:max-w-[390px] mx-auto" style={{overflowX: 'hidden'}}>
          <div className="space-y-2">
            {posts?.length > 0 ? (
              posts.map((post) => (
                <ErrorBoundary key={post.id}>
                  <PostCard post={post} />
                </ErrorBoundary>
              ))
            ) : !isLoading ? (
              <div className="text-center text-muted-foreground py-8">
                No posts yet. Be the first to share!
              </div>
            ) : null}

            {/* Loading indicator */}
            <div ref={loadingRef} className="flex justify-center py-4">
              {isLoading && (
                <Loader2 className="h-8 w-8 animate-spin" />
              )}
            </div>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}