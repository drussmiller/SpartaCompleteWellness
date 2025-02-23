import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user } = useAuth();

  const { data: posts, isLoading, error } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
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
        Error loading posts: {error.message}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold">Feed</h1>
          <CreatePostDialog />
        </div>
      </header>

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