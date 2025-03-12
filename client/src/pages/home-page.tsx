import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { useEffect } from "react";

export default function HomePage() {
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();

  // Only refetch when actually needed, not on every mount
  useEffect(() => {
    if (user) {
      // Only refetch if data is very stale (over 30 minutes old) or doesn't exist
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
        <div className="px-6 py-4 flex items-center  rounded-md m-2">
          <div className="flex items-center gap-2 max-w-[100%]">
            <img
              src="/Sparta_Logo.jpg"
              alt="Sparta Logo"
              className="h-14 w-auto flex-shrink-0"
              onError={(e) => {
                console.error('Error loading logo:', e);
                e.currentTarget.src = '/fallback-logo.png';
              }}
            />
            <h1 className="text-lg font-bold whitespace-nowrap overflow-hidden">Sparta Complete Wellness</h1>
          </div>
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