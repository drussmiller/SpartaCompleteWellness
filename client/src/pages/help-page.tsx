import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Activity } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";

const DEFAULT_HELP_HTML = `
<h2 style="display:flex;align-items:center;gap:8px">Home Page</h2>
<h3>Posts</h3>
<p>Your posts on the Home page seen by your team</p>
<p>Prayer requests are seen by your team and other teams.</p>
<h3>Post Types:</h3>
<ul>
<li><strong>Food:</strong> Up to 3 posts a day (3 points each). Sunday is a free day if you choose.</li>
<li><strong>Workout:</strong> Up to 5 posts a week (3 points each).</li>
<li><strong>Scripture:</strong> One for each day of the week (3 points each).</li>
<li><strong>Memory verse:</strong> One per week (10 points)</li>
<li><strong>Miscellaneous:</strong> No points are awarded.</li>
</ul>
<p><strong>Note:</strong> If you are in a team marked as "Competitive" you must post Food, Workout and Scripture post on the current day and not allowed to change the date.</p>
<p><strong>Note:</strong> Deleting a post with points will remove the points also</p>
<h3>Messages</h3>
<p>You can message only members of your team</p>
<h2 style="display:flex;align-items:center;gap:8px">Activity Page</h2>
<h3>Week Content</h3>
<ul>
<li>Memory Verse for the week is listed at the top of the section.</li>
<li>Follow the instructions in the section to have a successful week.</li>
</ul>
<h3>Week and Day Content</h3>
<ul>
<li>Today's Bible verse is at the top of the section.</li>
<li>Follow the instruction in the section to have a successful day.</li>
</ul>
<h3>Re-Engage (Non-competitive teams only)</h3>
<p>If for some reason you had a pause in the program and you want to re-engage where you left off you can select the week you'd like to restart the program. You will restart on the current day of the week. All posts and points Week/Day and after will be forfeited.</p>
`;

export default function HelpPage() {
  const isMobile = useIsMobile();

  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  const { data: pageData } = useQuery<{ pageName: string; content: string | null }>({
    queryKey: ["/api/page-content", "help"],
    queryFn: async () => {
      const res = await fetch("/api/page-content/help", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch help content");
      return res.json();
    },
  });

  const rawContent = pageData?.content || DEFAULT_HELP_HTML;
  const htmlContent = useMemo(() => DOMPurify.sanitize(rawContent), [rawContent]);

  return (
    <AppLayout>
      <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Help</h1>
        </div>
      </div>

      <main className={`pb-24 space-y-4 max-w-2xl mx-auto w-full pl-6 pr-4 py-6 text-lg mt-[40px] md:mt-[100px] ${isAndroid ? 'pb-[calc(24+40)px]' : ''}`}>
        <Card>
          <CardContent className="space-y-4 pt-6 prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
