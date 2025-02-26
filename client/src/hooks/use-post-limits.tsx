import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
}

export function usePostLimits() {
  const { user } = useAuth();
  const { data: posts } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  // Get start of current UTC day
  const today = new Date();
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Only count posts from the current user for today
  const todaysPosts = posts?.filter(post => {
    if (!user || post.userId !== user.id) return false;
    const postDate = new Date(post.createdAt!);
    return postDate >= startOfDay;
  }) || [];

  console.log('Current user ID:', user?.id);
  console.log('Today\'s posts for current user:', todaysPosts);

  const dailyCounts = todaysPosts.reduce((acc, post) => {
    if (post.type in acc) {
      acc[post.type as keyof PostLimits]++;
    }
    return acc;
  }, {
    food: 0,
    workout: 0,
    scripture: 0,
    memory_verse: 0
  } as PostLimits);

  // Check if it's Saturday
  const isSaturday = today.getDay() === 6;

  // Count memory verses for the current week
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Go to Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const weeklyMemoryVerses = posts?.filter(post => 
    post.type === 'memory_verse' && 
    new Date(post.createdAt!) >= startOfWeek &&
    post.userId === user?.id
  ).length || 0;

  console.log('Daily counts:', dailyCounts);

  const canPost = {
    food: dailyCounts.food < 3,
    workout: dailyCounts.workout < 1,
    scripture: dailyCounts.scripture < 1,
    memory_verse: isSaturday && weeklyMemoryVerses < 1
  };

  return {
    counts: dailyCounts,
    canPost,
    isSaturday
  };
}