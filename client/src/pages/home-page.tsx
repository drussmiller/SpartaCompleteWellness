import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining } = usePostLimits();

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
    retry: 2,
    retryDelay: 1000,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

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
    <div className="flex h-screen">
      {/* Side Navigation - Hidden on mobile */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border">
        <div className="flex-1 flex flex-col min-h-0 bg-background">
          <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-border">
            <h1 className="text-xl font-bold">Home</h1>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            <BottomNav orientation="vertical" />
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-64">
        <div className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4 flex justify-end">
            <CreatePostDialog remaining={remaining} />
          </div>
        </div>
        <main className="p-4 max-w-2xl mx-auto">
          <div className="space-y-4">
            {posts?.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
            {!posts?.length && (
              <p className="text-center text-muted-foreground py-8">
                No posts yet. Be the first to share!
              </p>
            )}
          </div>
        </main>
      </div>

      {/* Bottom Navigation - Only visible on mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <BottomNav />
      </div>
    </div>
  );
}