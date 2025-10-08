import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { YouTubePlayer } from "@/components/ui/youtube-player";

export default function ActivityPage() {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [weekContentOpen, setWeekContentOpen] = useState(false); // Week content defaults to closed
  const [weekDayContentOpen, setWeekDayContentOpen] = useState(true); // Week and Day content defaults to open

  const { data: activityStatus } = useQuery({
    queryKey: ["/api/activities/current"],
    queryFn: async () => {
      const response = await fetch(`/api/activities/current?tzOffset=${new Date().getTimezoneOffset()}`);
      if (!response.ok) throw new Error("Failed to fetch activity status");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Get all activities including Bible verses (activityTypeId = 0)
  const { data: allActivities, isLoading: activitiesLoading, error: activitiesError } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const response = await fetch(`/api/activities`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Separate Bible verses from workout activities
  const bibleVerses = React.useMemo(() => 
    allActivities?.filter(activity => activity.activityTypeId === 0) || [], 
    [allActivities]
  );

  const activities = React.useMemo(() => 
    allActivities?.filter(activity => 
      activity.activityTypeId === (user?.preferredActivityTypeId || 1)
    ) || [], 
    [allActivities, user?.preferredActivityTypeId]
  );

  // Set initial values based on current week/day
  React.useEffect(() => {
    if (activityStatus?.currentWeek && selectedWeek === 1) {
      setSelectedWeek(activityStatus.currentWeek);
    }
    if (activityStatus?.currentDay && selectedDay === 1) {
      setSelectedDay(activityStatus.currentDay);
    }
  }, [activityStatus]);

  // Navigation functions for week content
  const goToPreviousWeek = () => {
    if (selectedWeek > 1) {
      setSelectedWeek(selectedWeek - 1);
    }
  };

  const goToNextWeek = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    // Don't allow going beyond current week
    if (selectedWeek < currentWeek) {
      setSelectedWeek(selectedWeek + 1);
    }
  };

  // Navigation functions for daily content
  const goToPreviousDay = () => {
    if (selectedDay === 1) {
      // Go to previous week's day 7
      const prevWeek = selectedWeek - 1;
      if (prevWeek >= 1) {
        setSelectedWeek(prevWeek);
        setSelectedDay(7);
      }
    } else {
      setSelectedDay(selectedDay - 1);
    }
  };

  const goToNextDay = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    const currentDay = activityStatus?.currentDay || 1;

    // Don't allow going beyond current day
    if (selectedWeek === currentWeek && selectedDay >= currentDay) {
      return;
    }

    if (selectedDay === 7) {
      // Go to next week's day 1
      setSelectedWeek(selectedWeek + 1);
      setSelectedDay(1);
    } else {
      setSelectedDay(selectedDay + 1);
    }
  };

  // Check if we can navigate for week content
  const canGoToPreviousWeek = selectedWeek > 1;
  const canGoToNextWeek = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    return selectedWeek < currentWeek;
  };

  // Check if we can navigate for daily content
  const canGoToPrevious = selectedWeek > 1 || selectedDay > 1;
  const canGoToNext = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    const currentDay = activityStatus?.currentDay || 1;
    return !(selectedWeek === currentWeek && selectedDay >= currentDay);
  };

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

  // Find week content (day 0)
  const weekContent = activities?.find(activity => 
    activity.week === selectedWeek && activity.day === 0
  );

  // Find selected daily activity
  const selectedActivity = activities?.find(activity => 
    activity.week === selectedWeek && activity.day === selectedDay
  );

  // Find Bible verse for the selected day based on absolute day number
  // Calculate the absolute day: (week - 1) * 7 + day
  const absoluteDay = (selectedWeek - 1) * 7 + selectedDay;

  // Find the Bible verse that matches this absolute day
  // Bible verses are stored with their absolute day calculated as (week - 1) * 7 + day
  const selectedBibleVerse = bibleVerses?.find(verse => {
    const verseAbsoluteDay = (verse.week - 1) * 7 + verse.day;
    return verseAbsoluteDay === absoluteDay;
  });

  return (
    <AppLayout>
      <div className="min-h-screen w-full bg-background/95 p-6 pb-24 shadow-lg animate-in slide-in-from-right">
        <div className="flex items-center mb-6">
          <h1 className="text-2xl font-bold">Daily Activity</h1>
        </div>

        {/* Week Content Dropdown - Defaults to Closed */}
        <Collapsible open={weekContentOpen} onOpenChange={setWeekContentOpen}>
          <Card className="mb-6">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle>Week Content</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${weekContentOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousWeek}
                    disabled={!canGoToPreviousWeek}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">Week {selectedWeek}</h3>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextWeek}
                    disabled={!canGoToNextWeek()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Week Content Display */}
                {weekContent ? (
                  <div className="mt-4">
                    <h3 className="text-lg font-semibold mb-4">Week {selectedWeek} Information</h3>
                    <div className="space-y-4">
                      {weekContent.contentFields?.map((item: any, index: number) => (
                        <div key={index}>
                          {item.type === 'text' && (
                            <div>
                              <h4 className="text-md font-medium mb-2">{item.title}</h4>
                              <div 
                                className="rich-text-content daily-content"
                                style={{
                                  wordBreak: 'break-word',
                                  overflowWrap: 'break-word'
                                }}
                                dangerouslySetInnerHTML={{ 
                                  __html: (item.content || '')
                                    .replace(/(<\/div>)\\?">/g, '$1') // Remove \"> after closing div tags specifically
                                }} 
                              />
                            </div>
                          )}
                          {item.type === 'video' && (
                            <div>
                              <h4 className="text-md font-medium mb-2">{item.title}</h4>
                              <YouTubePlayer videoId={item.content} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-600 mt-4">
                    No week information available for Week {selectedWeek}.
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Week and Day Content Dropdown - Defaults to Open */}
        <Collapsible open={weekDayContentOpen} onOpenChange={setWeekDayContentOpen}>
          <Card className="mb-6">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle>Week and Day Content</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${weekDayContentOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousDay}
                    disabled={!canGoToPrevious}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">Week {selectedWeek} - Day {selectedDay}</h3>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextDay}
                    disabled={!canGoToNext()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Daily Activity Content Display */}
                {selectedActivity || selectedBibleVerse ? (
                  <div className="mt-4">
                    <div className="space-y-6">
                      {/* Display Bible verse first if it exists */}
                      {selectedBibleVerse && (
                        <div className="bible-verse-section">
                          {selectedBibleVerse.contentFields?.map((item: any, index: number) => {
                            if (item.type === 'text') {
                              // The server already converted Bible verses to links, just display the content
                              let content = item.content || '';
                              
                              return (
                                <div key={`bible-${index}`}>
                                  <div 
                                    className="rich-text-content daily-content prose prose-sm max-w-none"
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}
                                    dangerouslySetInnerHTML={{ 
                                      __html: content
                                    }} 
                                  />
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* Display workout activity content below Bible verse */}
                      {selectedActivity && (
                        <div className="workout-activity-section">
                          {selectedActivity.contentFields?.map((item: any, index: number) => (
                            <div key={`activity-${index}`}>
                              {item.type === 'text' && (
                                <div>
                                  <div 
                                    className="rich-text-content daily-content prose prose-sm max-w-none"
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}
                                    dangerouslySetInnerHTML={{ 
                                      __html: (item.content || '')
                                    }} 
                                  />
                                </div>
                              )}
                              {item.type === 'video' && (
                                <div>
                                  <h4 className="text-md font-medium mb-2">{item.title}</h4>
                                  <YouTubePlayer videoId={item.content} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Show message if only Bible verse exists but no workout */}
                      {selectedBibleVerse && !selectedActivity && (
                        <div className="text-center text-gray-600 mt-4 p-4 bg-muted/30 rounded-lg">
                          <p>
                            No workout activity available for Week {selectedWeek}, Day {selectedDay}.
                            <br />
                            Check with your coach if you think this is an error.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : activityStatus?.programHasStarted === false ? (
                  <div className="text-center mt-4">
                    <h3 className="text-xl font-semibold mb-2">Program Starting Soon</h3>
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
                ) : (
                  <p className="text-center text-gray-600 mt-4">
                    No activity available for Week {selectedWeek}, Day {selectedDay}.
                    <br />
                    Check with your coach if you think this is an error.
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </AppLayout>
  );
}