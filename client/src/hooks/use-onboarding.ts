import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export type OnboardingStep = "post_intro" | "join_team" | "complete";

export function useOnboarding() {
  const { user } = useAuth();

  const { data: introVideoPosts = [] } = useQuery({
    queryKey: ["/api/posts", "introductory_video", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/posts?type=introductory_video&userId=${user.id}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data.posts ?? []);
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const hasPostedIntroVideo = introVideoPosts.length > 0;
  const hasTeam = !!user?.teamId;

  let step: OnboardingStep = "complete";
  if (!hasPostedIntroVideo) {
    step = "post_intro";
  } else if (!hasTeam) {
    step = "join_team";
  }

  return {
    step,
    hasPostedIntroVideo,
    hasTeam,
    isOnboarding: step !== "complete",
    highlightHome: step === "post_intro",
    highlightPlus: step === "post_intro",
    highlightMenu: step === "join_team",
    highlightJoinTeam: step === "join_team",
  };
}
