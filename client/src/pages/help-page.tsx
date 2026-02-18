import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Activity } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemo } from "react";

export default function HelpPage() {
  const isMobile = useIsMobile();
  
  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);
  
  return (
    <AppLayout>
      <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Help</h1>
        </div>
      </div>

      <main className={`pb-24 space-y-4 max-w-2xl mx-auto w-full pl-6 pr-4 py-6 text-lg mt-[40px] md:mt-[100px] ${isAndroid ? 'pb-[calc(24+40)px]' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Home Page
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <h3 className="font-semibold">Posts</h3>
            <p>Your posts on the Home page seen by your team</p>
            <p>Prayer requests are seen by your team and other teams.</p>

            <h3 className="font-semibold mt-4">Post Types:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Food:</strong> Up to 3 posts a day (3 points each). Sunday is a free day if you choose.</li>
              <li><strong>Workout:</strong> Up to 5 posts a week (3 points each).</li>
              <li><strong>Scripture:</strong> One for each day of the week (3 points each).</li>
              <li><strong>Memory verse:</strong> One per week (10 points)</li>
              <li><strong>Miscellaneous:</strong> No points are awarded.</li>
            </ul>

            <div className="bg-muted/50 p-3 rounded-md mt-4 space-y-2">
              <p className="text-sm">
                <strong>Note:</strong> If you are in a team marked as "Competitive" you must post Food, Workout and Scripture post on the current day and not allowed to change the date.
              </p>
              <p className="text-sm">
                <strong>Note:</strong> Deleting a post with points will remove the points also
              </p>
            </div>

            <h3 className="font-semibold mt-4">Messages</h3>
            <p>You can message only members of your team</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Page
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">Week Content</h3>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Memory Verse for the week is listed at the top of the section.</li>
                <li>Follow the instructions in the section to have a successful week.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold">Week and Day Content</h3>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Today's Bible verse is at the top of the section.</li>
                <li>Follow the instruction in the section to have a successful day.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold">Re-Engage (Non-competitive teams only)</h3>
              <p className="mt-2">
                If for some reason you had a pause in the program and you want to re-engage where you left off you can select the week you'd like to restart the program. You will restart on the current day of the week. All posts and points Week/Day and after will be forfeited.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
