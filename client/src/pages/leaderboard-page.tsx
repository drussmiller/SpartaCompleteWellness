import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

type TeamMember = {
  id: number;
  username: string;
  imageUrl: string | null;
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
  weekRange: {
    start: string;
    end: string;
  };
};

export function LeaderboardPage() {
  const [isOpen, setIsOpen] = useState(true);
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard"],
    refetchInterval: 60000, // Refresh every minute
  });

  useEffect(() => {
    if (!isOpen) {
      // Navigate back when sheet is closed
      navigate("/menu");
    }
  }, [isOpen, navigate]);

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

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "h-[90vh] overflow-y-auto" : "w-[400px] overflow-y-auto"}
      >
        <SheetHeader className="flex flex-row justify-between items-center mb-4">
          <SheetTitle className="text-2xl font-bold">Leaderboard</SheetTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </SheetHeader>

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
              <TabsTrigger value="team" className="flex-1">My Team</TabsTrigger>
              <TabsTrigger value="all" className="flex-1">All Teams</TabsTrigger>
            </TabsList>

            <TabsContent value="team">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Team Members</CardTitle>
                  <CardDescription>{weekRangeText}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.isArray(data?.teamMembers) && data?.teamMembers.map((member, index) => (
                    <div key={member.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <Avatar>
                          <AvatarImage src={member.imageUrl || ""} />
                          <AvatarFallback>{member.username.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{member.username}</div>
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
                  <CardDescription>{weekRangeText}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.isArray(data?.teamStats) ? data?.teamStats.map((team, index) => (
                    <div key={team.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <div className="font-medium">{team.name}</div>
                      </div>
                      <div className="font-bold text-primary">{team.avg_points} pts</div>
                    </div>
                  )) : data?.teamStats?.rows?.map((team, index) => (
                    <div key={team.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <div className="font-medium">{team.name}</div>
                      </div>
                      <div className="font-bold text-primary">{team.avg_points} pts</div>
                    </div>
                  ))}
                  
                  {(!data?.teamStats || (Array.isArray(data?.teamStats) && data?.teamStats.length === 0) || 
                    (data?.teamStats?.rows && data?.teamStats?.rows.length === 0)) && (
                    <div className="text-center py-4 text-gray-500">
                      No teams found
                    </div>
                  )}
                </CardContent>
                <CardFooter className="text-xs text-gray-500">
                  Average points per team member
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}