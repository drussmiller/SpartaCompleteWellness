import { useQuery } from "@tanstack/react-query";
import { Post, User } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";

export default function HomePage() {
  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between p-4">
          <img src="/images/sparta-logo.jpg" alt="Sparta Complete Wellness" className="h-16" />
          <CreatePostDialog />
        </div>
      </header>

      <main className="p-4 space-y-4">
        {posts?.map((post) => {
          const user = users?.find((u) => u.id === post.userId);
          if (!user) return null;
          return <PostCard key={post.id} post={post} user={user} />;
        })}
      </main>

      <BottomNav />
    </div>
  );
}
