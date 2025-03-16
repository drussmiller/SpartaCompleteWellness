import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining } = usePostLimits();
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  const { isLoading, error } = useQuery({
    queryKey: ["/api/posts", page],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/posts?page=${page}&limit=10`);
        if (!response.ok) {
          throw new Error(`Failed to fetch posts: ${response.status}`);
        }
        const newPosts = await response.json();
        setPosts(prev => [...prev, ...newPosts]);
        setHasMore(newPosts.length === 10);
        return newPosts;
      } catch (error) {
        console.error("Error fetching posts:", error);
        throw error;
      }
    },
    enabled: !!user && hasMore,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false
  });

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="px-4 py-2 flex items-center justify-between">
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

      <div className="flex-1">
        {posts.length > 0 ? (
          posts.map((post) => (
            <ErrorBoundary key={post.id}>
              <PostCard post={post} />
            </ErrorBoundary>
          ))
        ) : !isLoading ? (
          <p className="text-center text-muted-foreground py-8">
            No posts yet. Be the first to share!
          </p>
        ) : null}
      </div>

      <div ref={loadingRef} className="flex justify-center py-4">
        {isLoading && (
          <Loader2 className="h-8 w-8 animate-spin" />
        )}
      </div>
    </AppLayout>
  );
}