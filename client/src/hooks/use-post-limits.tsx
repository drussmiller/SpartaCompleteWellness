import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface PostLimits {
  food: number;
  workout: number;
  scripture: number;
  memory_verse: number;
}

export function usePostLimits() {
  const { data: posts } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  const todaysPosts = posts?.filter(post => 
    new Date(post.createdAt!) >= startOfDay
  ) || [];

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
    new Date(post.createdAt!) >= startOfWeek
  ).length || 0;

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
