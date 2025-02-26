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
    enabled: !!user
  });

  // Get start of current UTC day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Only count posts from the current user for today
  const todaysPosts = posts?.filter(post => {
    if (!user || post.userId !== user.id) return false;
    const postDate = new Date(post.createdAt!);
    return postDate >= today;
  }) || [];

  console.log('Current user ID:', user?.id);
  console.log('Today\'s posts for current user:', todaysPosts);

  // Count posts by type
  const dailyCounts = todaysPosts.reduce((acc, post) => {
    acc[post.type as keyof PostLimits] = (acc[post.type as keyof PostLimits] || 0) + 1;
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
    post.userId === user?.id &&
    new Date(post.createdAt!) >= startOfWeek
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