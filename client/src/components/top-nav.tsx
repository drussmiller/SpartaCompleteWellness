
import { CreatePostDialog } from "./create-post-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Team } from "@shared/schema";

export function TopNav() {
  const { user } = useAuth();

  const { data: team } = useQuery<Team>({
    queryKey: ["/api/teams", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) return null;
      const res = await fetch(`/api/teams/${user.teamId}`);
      if (!res.ok) throw new Error("Failed to fetch team");
      return res.json();
    },
    enabled: !!user?.teamId
  });

  return (
    <nav className="sticky top-0 z-50 bg-background border-b border-border pt-12">
      <div className="flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <img
            src="/Sparta_Logo.jpg"
            alt="Sparta Complete Wellness"
            className="h-16 object-contain"
          />
          {team && (
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Team</span>
              <span className="font-semibold">{team.name}</span>
            </div>
          )}
        </div>
        <div className="scale-125">
          <CreatePostDialog />
        </div>
      </div>
    </nav>
  );
}
