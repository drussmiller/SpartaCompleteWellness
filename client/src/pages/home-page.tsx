import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/hooks/use-auth";
import { TopNav } from "@/components/top-nav";
import { apiRequest } from "@/lib/queryClient";

export default function HomePage() {
  const { user } = useAuth();

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
    <div className="max-w-2xl mx-auto pb-20">
      <TopNav />
      <main className="p-4 space-y-4">
        <CreatePostDialog />
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        {!posts?.length && (
          <p className="text-center text-muted-foreground py-8">
            No posts yet. Be the first to share!
          </p>
        )}
      </main>
      <BottomNav />
    </div>
  );
}