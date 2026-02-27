import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { ChevronLeft, Filter, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getDisplayName, getDisplayInitial, cn } from "@/lib/utils";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type TeamMember = {
  id: number;
  username: string;
  imageUrl: string | null;
  avatarColor: string | null;
  points: number;
};

type TeamStat = {
  id: number;
  name: string;
  avg_points: number;
};

type TeamStatsResponse = TeamStat[] | {
  rows: Array<{
    id: number;
    name: string;
    avg_points: number;
  }>;
};

type LeaderboardData = {
  teamMembers: TeamMember[];
  teamStats: TeamStatsResponse;
  teamName?: string;
  weekRange: {
    start: string;
    end: string;
  };
};

interface LeaderboardPageProps {
  onClose?: () => void;
}

export function LeaderboardPage({ onClose }: LeaderboardPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);

  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    }
  });

  const canSelectTeam = !!(user?.isAdmin || user?.isOrganizationAdmin || user?.isGroupAdmin);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem("leaderboardSelectedTeamId");
    return saved ? parseInt(saved) : null;
  });
  const [selectedTeamName, setSelectedTeamName] = useState<string>(() => {
    return sessionStorage.getItem("leaderboardSelectedTeamName") || "";
  });
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  useEffect(() => {
    if (selectedTeamId !== null) {
      sessionStorage.setItem("leaderboardSelectedTeamId", selectedTeamId.toString());
    } else {
      sessionStorage.removeItem("leaderboardSelectedTeamId");
    }
    sessionStorage.setItem("leaderboardSelectedTeamName", selectedTeamName);
  }, [selectedTeamId, selectedTeamName]);

  const { data: availableTeams = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/teams/for-leaderboard-filter"],
    queryFn: async () => {
      if (user?.isGroupAdmin && !user?.isOrganizationAdmin && !user?.isAdmin) {
        const res = await apiRequest("GET", "/api/group-admin/teams");
        if (!res.ok) return [];
        return res.json();
      }
      const res = await apiRequest("GET", "/api/teams");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canSelectTeam,
    staleTime: 60000,
  });

  const leaderboardUrl = selectedTeamId && canSelectTeam
    ? `/api/leaderboard?teamId=${selectedTeamId}`
    : "/api/leaderboard";

  const { data, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard", selectedTeamId] as const,
    queryFn: async ({ queryKey }) => {
      const teamId = queryKey[1] as number | null;
      const url = teamId && canSelectTeam
        ? `/api/leaderboard?teamId=${teamId}`
        : "/api/leaderboard";
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (!user) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const weekRangeText = data
    ? `${formatDate(data.weekRange.start)} - ${formatDate(data.weekRange.end)}`
    : "This Week";

  const displayTeamName = selectedTeamId && selectedTeamName
    ? selectedTeamName
    : (data?.teamName || "My Team");

  const handleBackClick = () => {
    if (isSheetMode && onClose) {
      onClose();
    } else {
      navigate("/menu");
    }
  };

  const teamStatRows = Array.isArray(data?.teamStats)
    ? data.teamStats
    : (data?.teamStats as any)?.rows ?? [];

  return (
    <div className="flex flex-col h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-background flex-shrink-0">
        <div className="container flex items-center justify-between p-4 pt-16">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 scale-125"
              onClick={handleBackClick}
            >
              <ChevronLeft className="h-8 w-8 scale-125" />
            </Button>
            <h1 className="text-lg font-semibold">Leaderboard</h1>
          </div>

          {canSelectTeam && (
            <Popover open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={selectedTeamId ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-8 max-w-[160px]"
                >
                  <Filter className="h-3 w-3 mr-1 shrink-0" />
                  <span className="truncate">
                    {selectedTeamId ? selectedTeamName : "Select Team"}
                  </span>
                  <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                {selectedTeamId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs mb-2 text-muted-foreground"
                    onClick={() => {
                      setSelectedTeamId(null);
                      setSelectedTeamName("");
                      setTeamPickerOpen(false);
                    }}
                  >
                    Clear — show my team
                  </Button>
                )}
                <Command>
                  <CommandInput placeholder="Search teams..." className="h-8 text-sm" />
                  <CommandList className="max-h-60">
                    <CommandEmpty>No teams found.</CommandEmpty>
                    <CommandGroup heading="Select a team">
                      {availableTeams.map((team) => (
                        <CommandItem
                          key={team.id}
                          value={team.name}
                          onSelect={() => {
                            setSelectedTeamId(team.id);
                            setSelectedTeamName(team.name);
                            setTeamPickerOpen(false);
                          }}
                          className="text-sm cursor-pointer"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3 w-3 shrink-0",
                              selectedTeamId === team.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {team.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </header>

      <div
        className={`flex-1 overflow-y-auto ${isAndroid ? 'pb-40' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="container py-4 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <p>Loading leaderboard data...</p>
          </div>
        ) : error ? (
          <div className="text-center text-red-500 p-4">
            <p>Error loading leaderboard data</p>
            <p className="text-sm">{(error as Error).message}</p>
          </div>
        ) : (
          <Tabs defaultValue="team" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="team" className="flex-1 text-base">
                {selectedTeamId ? selectedTeamName : "My Team"}
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1 text-base">All Teams</TabsTrigger>
            </TabsList>

            <TabsContent value="team">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {selectedTeamId ? `${selectedTeamName} Members` : "Team Members"}
                  </CardTitle>
                  <CardDescription>{weekRangeText}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.isArray(data?.teamMembers) && data?.teamMembers.map((member, index) => (
                    <div key={member.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <Avatar>
                          <AvatarImage src={member.imageUrl || ""} />
                          <AvatarFallback 
                            style={{ backgroundColor: member.avatarColor || '#6366F1' }}
                            className="text-white"
                          >
                            {getDisplayInitial(member)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{getDisplayName(member)}</div>
                      </div>
                      <div className="font-bold text-primary">{member.points} pts</div>
                    </div>
                  ))}
                  
                  {(!data?.teamMembers || (Array.isArray(data?.teamMembers) && data?.teamMembers.length === 0)) && (
                    <div className="text-center py-4 text-gray-500">
                      No team members found
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Team Ranking</CardTitle>
                  <CardDescription>
                    {selectedTeamId
                      ? `Division standings for ${selectedTeamName}`
                      : "Goal Completion Percentage"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {teamStatRows.map((team: TeamStat, index: number) => (
                    <div
                      key={team.id}
                      className={cn(
                        "flex items-center justify-between p-2 border-b last:border-b-0",
                        selectedTeamId === team.id ? "bg-primary/5 rounded-md" : ""
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <div className="font-medium">
                          {team.name}
                          {selectedTeamId === team.id && (
                            <span className="ml-2 text-xs text-primary font-normal">(selected)</span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-primary">{team.avg_points}%</div>
                    </div>
                  ))}
                  
                  {teamStatRows.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      No teams found
                    </div>
                  )}
                </CardContent>
                <CardFooter className="text-xs text-gray-500">
                  Based on the team's weekly goal achievement rate
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
