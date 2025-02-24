
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomNav } from "@/components/bottom-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function ActivityPage() {
  // Calculate current week based on current day
  const currentWeek = Math.ceil(currentDay / 7);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [selectedDay, setSelectedDay] = useState(currentDay);

  const { data: activities } = useQuery({
    queryKey: ["/api/activities"],
  });

  // Get the current day number based on user's start date
  // For now using a simple counter, but you can modify this based on actual start date
  // Calculate current day based on Monday start
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday (0) to 7

  const currentActivity = activities?.find(
    (a) => a.week === selectedWeek && a.day === selectedDay
  );

  const weeks = Array.from(new Set(activities?.map((a) => a.week) || [])).sort();
  const days = activities
    ?.filter((a) => a.week === selectedWeek)
    .map((a) => a.day)
    .sort() || [];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold">Daily Activity</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {weeks.map((week) => (
            <Button
              key={week}
              variant={selectedWeek === week ? "default" : "outline"}
              onClick={() => setSelectedWeek(week)}
              disabled={week > Math.ceil(currentDay / 7)}
            >
              Week {week}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => (
            <Button
              key={day}
              variant={selectedDay === day ? "default" : "outline"}
              onClick={() => setSelectedDay(day)}
              disabled={selectedWeek * 7 + day > currentDay}
            >
              Day {day}
            </Button>
          ))}
        </div>

        {currentActivity ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Week {currentActivity.week} - Day {currentActivity.day}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <h2>Memory Verse</h2>
                <blockquote>
                  {currentActivity.memoryVerseReference} - "{currentActivity.memoryVerse}"
                </blockquote>

                {currentActivity.description && (
                  <>
                    <h2>Description</h2>
                    <p>{currentActivity.description}</p>
                  </>
                )}

                {currentActivity.tasks && (
                  <>
                    <h2>Tasks</h2>
                    <div dangerouslySetInnerHTML={{ __html: currentActivity.tasks }} />
                  </>
                )}

                {currentActivity.scripture && (
                  <>
                    <h2>Scripture Reading</h2>
                    <p>{currentActivity.scripture}</p>
                  </>
                )}

                {currentActivity.workout && (
                  <>
                    <h2>Workout</h2>
                    <div dangerouslySetInnerHTML={{ __html: currentActivity.workout }} />
                    {currentActivity.workoutVideo && (
                      <div className="mt-4 aspect-video">
                        <iframe
                          className="w-full h-full rounded-lg"
                          src={currentActivity.workoutVideo.replace('watch?v=', 'embed/')}
                          title="Workout Video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}
                  </>
                )}
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

      <BottomNav />
    </div>
  );
}
