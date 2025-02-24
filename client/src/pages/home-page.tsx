import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/hooks/use-auth";
import { TopNav } from "@/components/top-nav";

export default function HomePage() {
  const { user } = useAuth();

  const { data: posts, isLoading, error } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
    enabled: !!user
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
      <div className="flex items-center justify-center min-h-screen text-destructive">
        Error loading posts: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <TopNav />

      <main className="p-4 space-y-4">
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} user={user!} />
        ))}
        {posts?.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No posts yet. Be the first to share!
          </p>
        )}
      </main>

      <BottomNav />
    </div>
  );
}