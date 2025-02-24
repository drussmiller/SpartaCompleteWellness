
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomNav } from "@/components/bottom-nav";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ActivityPage() {
  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold">Daily Activity</h1>
        </div>
      </header>

      <main className="p-4">
        <Card>
          <CardHeader>
            <CardTitle>Week 1</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <h2>Memory Verse</h2>
              <blockquote>
                Psalm 133:1 - "Behold how good and pleasant it is for brothers to dwell together in unity."
              </blockquote>

              <h2>Initial Measurements</h2>
              <ol>
                <li>Take front and side photos with timestamp (for personal reference)</li>
                <li>Record your weight in pounds</li>
                <li>Measure your waist at belly button level</li>
              </ol>

              <h2>Daily Schedule</h2>
              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  <div>
                    <h3>Day 1</h3>
                    <p><strong>Scripture:</strong> John 1:1-18</p>
                    <p><strong>Workout:</strong> Initial Testing</p>
                    <ul>
                      <li>Squat Test</li>
                      <li>Burpee Test</li>
                      <li>Pull-up Test</li>
                      <li>Reverse Lunge Test</li>
                      <li>Push-up Test</li>
                      <li>Sit-up Test</li>
                      <li>Chin-up Test</li>
                    </ul>
                  </div>
                  
                  {/* Additional days can be added here as needed */}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNav />
    </div>
  );
}
