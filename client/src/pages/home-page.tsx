import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining } = usePostLimits();

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
    <AppLayout>
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        {/* Title bar with Add Post button */}
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold">Sparta</h1>
          <CreatePostDialog remaining={remaining} />
        </div>

        {/* Team name */}
        <div className="px-6 py-3 border-t border-border">
          <h2 className="text-sm text-muted-foreground">
            {teamInfo?.name || "Join a Team"}
          </h2>
          {!user?.teamId && (
            <p className="text-sm text-muted-foreground mt-1">
              Join a team to start your journey
            </p>
          )}
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
    </AppLayout>
  );
}