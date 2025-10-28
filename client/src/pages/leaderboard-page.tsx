import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppLayout } from "@/components/app-layout";
import { BottomNav } from "@/components/bottom-nav";
import { Link } from "wouter";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";

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

interface LeaderboardPageProps {
  onClose?: () => void;
}

export function LeaderboardPage({ onClose }: LeaderboardPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose); // If onClose is provided, we're in sheet mode

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    }
  });

  const { data, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ["/api/leaderboard"],
    refetchInterval: 60000, // Refresh every minute
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

  const handleBackClick = () => {
    if (isSheetMode && onClose) {
      onClose();
    } else {
      navigate("/menu");
    }
  };

  return (
    <div 
      className="flex flex-col h-screen pb-16 md:pb-0"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="sticky top-0 z-50 border-b border-border bg-background flex-shrink-0">
        <div className="container flex items-center p-4 pt-16">
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
      </header>

      <div className="flex-1 overflow-y-auto">
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
              <TabsTrigger value="team" className="flex-1 text-base">My Team</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 text-base">All Teams</TabsTrigger>
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
                          <AvatarFallback 
                            style={{
                              backgroundColor: `hsl(${(member.id * 137.508) % 360}, 70%, 50%)`,
                              color: 'white'
                            }}
                          >
                            {member.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
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
                  <CardDescription>Goal Completion Percentage</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.isArray(data?.teamStats) ? data?.teamStats.map((team, index) => (
                    <div key={team.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <div className="font-medium">{team.name}</div>
                      </div>
                      <div className="font-bold text-primary">{team.avg_points}%</div>
                    </div>
                  )) : data?.teamStats?.rows?.map((team, index) => (
                    <div key={team.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="font-bold w-6 text-center">{index + 1}</div>
                        <div className="font-medium">{team.name}</div>
                      </div>
                      <div className="font-bold text-primary">{team.avg_points}%</div>
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