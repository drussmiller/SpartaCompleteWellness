import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export default function ActivityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get timezone offset for the current user (in minutes)
  const tzOffset = new Date().getTimezoneOffset();

  // Debug timezone information
  useEffect(() => {
    console.log('Timezone:', {
      name: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: -tzOffset/60
    });
  }, [tzOffset]);

  // Get current week and day from the server
  const { data: currentProgress, isLoading: isProgressLoading } = useQuery({
    queryKey: ["/api/activities/current", { tzOffset }],
    queryFn: async () => {
      const response = await fetch(`/api/activities/current?tzOffset=${tzOffset}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch current progress');
      }
      return response.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (currentProgress) {
      setSelectedWeek(currentProgress.currentWeek);
      setSelectedDay(currentProgress.currentDay);
    }
  }, [currentProgress]);

  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1);


  const { data: activities, isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["/api/activities"]
  });

  const currentActivity = activities?.find(
    (a) => a.week === selectedWeek && a.day === selectedDay
  );

  const navigatePrevDay = () => {
    if (selectedDay > 1) {
      setSelectedDay(selectedDay - 1);
    } else if (selectedWeek > 1) {
      const prevWeek = selectedWeek - 1;
      setSelectedWeek(prevWeek);
      const maxDay = 7;
      setSelectedDay(maxDay);
    }
  };

  const navigateNextDay = () => {
    // Only allow navigating up to current calculated day
    if (!currentProgress) return;

    const isLastDayOfWeek = selectedDay >= 7;

    if (!isLastDayOfWeek) {
      setSelectedDay(selectedDay + 1);
    } else if (selectedWeek < currentProgress.currentWeek) {
      setSelectedWeek(selectedWeek + 1);
      setSelectedDay(1);
    }
  };

  if (isProgressLoading || isActivitiesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading activities...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold pl-2">Daily Activity</h1>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={navigatePrevDay}
            disabled={selectedWeek === 1 && selectedDay === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-lg">
            Week {selectedWeek} - Day {selectedDay}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={navigateNextDay}
            disabled={
              !currentProgress ||
              (selectedWeek === currentProgress.currentWeek && 
               selectedDay >= currentProgress.currentDay)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {currentActivity ? (
          <Card>
            <CardContent className="p-6">
              <div className="prose max-w-none">
                {currentActivity.contentFields?.map((field, index) => (
                  <div key={index} className="mb-8">
                    {field.title && field.title !== `Week ${selectedWeek} - Day ${selectedDay}` && (
                      <h2 className="text-xl font-bold mb-4">{field.title}</h2>
                    )}
                    <div 
                      className="rich-text-content prose-sm" 
                      dangerouslySetInnerHTML={{ 
                        __html: field.content 
                      }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No activity found for this day
            </CardContent>
          </Card>
        )}
      </main>
      <div className="md:hidden">
        <BottomNav orientation="horizontal" />
      </div>
    </div>
  );
}