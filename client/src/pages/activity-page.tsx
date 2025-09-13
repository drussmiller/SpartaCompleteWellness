
import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { YouTubePlayer } from "@/components/ui/youtube-player";
import { ChevronLeft } from "lucide-react";

export default function ActivityPage() {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(0); // 0 for week content, 1-7 for daily

  const { data: activityStatus } = useQuery({
    queryKey: ["/api/activities/current"],
    queryFn: async () => {
      const response = await fetch(`/api/activities/current?tzOffset=${new Date().getTimezoneOffset()}`);
      if (!response.ok) throw new Error("Failed to fetch activity status");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Get all activities based on user's activity type preference
  const { data: activities, isLoading: activitiesLoading, error: activitiesError } = useQuery<Activity[]>({
    queryKey: ["/api/activities", user?.preferredActivityTypeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (user?.preferredActivityTypeId) {
        params.append('activityTypeId', user.preferredActivityTypeId.toString());
      }
      const response = await fetch(`/api/activities?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Set initial values based on current week/day
  React.useEffect(() => {
    if (activityStatus?.currentWeek && selectedWeek === 1) {
      setSelectedWeek(activityStatus.currentWeek);
    }
    if (activityStatus?.currentDay && selectedDay === 0) {
      setSelectedDay(activityStatus.currentDay);
    }
  }, [activityStatus]);

  if (activitiesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p>Loading activities...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (activitiesError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Activities</h2>
              <p className="text-gray-600">{activitiesError instanceof Error ? activitiesError.message : 'An error occurred'}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Get unique weeks for dropdown
  const availableWeeks = Array.from(new Set(activities?.map(a => a.week) || [])).sort((a, b) => a - b);
  
  // Get available days for selected week
  const availableDaysForWeek = activities?.filter(a => a.week === selectedWeek).map(a => a.day).sort((a, b) => a - b) || [];
  
  // Find selected activity
  const selectedActivity = activities?.find(activity => 
    activity.week === selectedWeek && activity.day === selectedDay
  );
  
  return (
    <AppLayout>
      <div className="min-h-screen w-full bg-background/95 p-6 pb-24 shadow-lg animate-in slide-in-from-right">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="p-2 mr-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
          >
            <ChevronLeft className="h-8 w-8" />
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-2xl font-bold">Daily Activity</h1>
        </div>

        {/* Week and Day Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Week</label>
                <Select value={selectedWeek.toString()} onValueChange={(value) => {
                  setSelectedWeek(parseInt(value));
                  setSelectedDay(0); // Reset to week content when week changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWeeks.map((week) => (
                      <SelectItem key={week} value={week.toString()}>
                        Week {week}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Content</label>
                <Select value={selectedDay.toString()} onValueChange={(value) => setSelectedDay(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select content" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDaysForWeek.includes(0) && (
                      <SelectItem value="0">Week {selectedWeek} Information</SelectItem>
                    )}
                    {[1, 2, 3, 4, 5, 6, 7].filter(day => availableDaysForWeek.includes(day)).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        Day {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Content */}
        {selectedActivity ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                {selectedActivity.day === 0 
                  ? `Week ${selectedActivity.week} Information` 
                  : `Week ${selectedActivity.week} - Day ${selectedActivity.day}`
                }
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedActivity.contentFields?.map((item: any, index: number) => (
                  <div key={index}>
                    {item.type === 'text' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                        <div 
                          className="rich-text-content daily-content"
                          style={{
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word'
                          }}
                          dangerouslySetInnerHTML={{ __html: item.content }} 
                        />
                      </div>
                    )}
                    {item.type === 'video' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                        <YouTubePlayer videoId={item.content} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : activityStatus?.programHasStarted === false ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Program Starting Soon</h2>
                <p className="text-gray-600 mb-4">
                  Your program will start on {activityStatus?.programStartDate ? 
                    new Date(activityStatus.programStartDate).toLocaleDateString() : 'soon'
                  }
                </p>
                {activityStatus?.daysToProgramStart && (
                  <p className="text-sm text-gray-500">
                    {activityStatus.daysToProgramStart} days until your program begins
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-center text-gray-600">
                {selectedDay === 0 
                  ? `No week information available for Week ${selectedWeek}.`
                  : `No activity available for Week ${selectedWeek}, Day ${selectedDay}.`
                }
                <br />
                Check with your coach if you think this is an error.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
