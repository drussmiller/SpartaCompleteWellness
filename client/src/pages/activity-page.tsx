import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ActivityPage() {
  const { user } = useAuth();

  // Get the current day number based on Monday start
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday (0) to 7

  // Calculate current week based on current day
  const currentWeek = Math.ceil(currentDay / 7);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [selectedDay, setSelectedDay] = useState(currentDay);

  const { data: activities } = useQuery({
    queryKey: ["/api/activities"],
  });

  const currentActivity = activities?.find(
    (a) => a.week === selectedWeek && a.day === selectedDay
  );

  const weeks = Array.from(new Set(activities?.map((a) => a.week) || [])).sort();
  const days = activities
    ?.filter((a) => a.week === selectedWeek)
    .map((a) => a.day)
    .sort() || [];

  const navigatePrevDay = () => {
    if (selectedDay > 1) {
      setSelectedDay(selectedDay - 1);
    } else if (selectedWeek > 1) {
      setSelectedWeek(selectedWeek - 1);
      // Find the max day in the previous week
      const prevWeekDays = activities
        ?.filter((a) => a.week === selectedWeek - 1)
        .map((a) => a.day)
        .sort((a, b) => b - a) || [];
      setSelectedDay(prevWeekDays[0] || 7);
    }
  };

  const navigateNextDay = () => {
    const maxDayInCurrentWeek = Math.max(...(activities
      ?.filter((a) => a.week === selectedWeek)
      .map((a) => a.day) || [7]));

    if (selectedDay < maxDayInCurrentWeek) {
      setSelectedDay(selectedDay + 1);
    } else if (selectedWeek < Math.max(...weeks)) {
      setSelectedWeek(selectedWeek + 1);
      setSelectedDay(1);
    }
  };

  return (
    <div className="min-h-screen relative pb-20 md:pb-0 md:ml-20">
      <div className="flex">
        <div className="hidden md:block"> {/* Added vertical navigation bar */}
          <BottomNav orientation="vertical" />
        </div>
        <div className="w-full">
          <header className="w-full bg-background border-b border-border">
            <div className="p-4">
              <h1 className="text-xl font-bold">Daily Activity</h1>
            </div>
          </header>

          <main className="p-4 max-w-3xl mx-auto w-full"> {/* Added max-width and centering */}
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
                disabled={(selectedWeek * 7 + selectedDay) >= (currentWeek * 7 + currentDay)}
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
        </div>
      </div>
      <div className="md:hidden">
        <BottomNav orientation="horizontal" />
      </div>
    </div>
  );
}