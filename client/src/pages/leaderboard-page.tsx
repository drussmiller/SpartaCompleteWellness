import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppLayout } from "@/components/app-layout";
import { BottomNav } from "@/components/bottom-nav";

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
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard"],
    refetchInterval: 60000, // Refresh every minute
  });

  const handleBack = () => {
    navigate("/menu");
  };

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
    <div className="flex flex-col min-h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="container flex items-center py-4">
          <Button variant="ghost" onClick={handleBack} size="icon" className="mr-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Leaderboard</h1>
        </div>
      </header>

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
                  
                  {(!data?.teamStats || 
                    (Array.isArray(data?.teamStats) && data?.teamStats.length === 0) || 
                    (data?.teamStats && 'rows' in data.teamStats && data.teamStats.rows.length === 0)) && (
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
      </div>
      <BottomNav />
    </div>
  );
}