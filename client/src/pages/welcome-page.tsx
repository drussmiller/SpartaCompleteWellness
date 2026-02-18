
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo } from "react";
import { YouTubePlayer } from "@/components/ui/youtube-player";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";

interface WelcomePageProps {
  onClose?: () => void;
}

const DEFAULT_WELCOME_HTML = `
<h2>Welcome to Sparta Complete Wellness!</h2>
<p>Thank you for having the courage and conviction to start this life changing experience. This is the first step of many in the process of getting fit physically, mentally, emotionally, and spiritually.</p>
<p>You will be in a division with up to 9 other men to make up your Team. You are an important part of this Team. Every time you post a meal pic, commentary, sweaty selfie, you inspire the other men on your Team. In the spirit of competition, and accountability, points will be accumulated by you, and your Team, that will guarantee healthy change for a lifetime.</p>
<h2>Getting Started</h2>
<h3>1) Take Before Photos</h3>
<p>Take two pictures of yourself, one from the front and one from the side. These will be used for you to document your great results. We will remind you to retake these pictures each time you go to the next level.</p>
<p><em>(You are not required to post these photos. Take pictures dressed in shorts and fitted t-shirt.)</em></p>
<h3>2) Weigh Yourself</h3>
<p>Weigh yourself and take a picture of the reading. We know that this is not a true measuring tool of fitness, but it is a measuring tool that we like to track. We will remind you to weigh yourself again each time you go to the next level.</p>
<p><em>(You are not required to post this photo.)</em></p>
<h3>3) Measure Your Waist</h3>
<p>Measure yourself around your waist where your belly button is located. Lost inches around the waist is another great measuring tool. We will remind you to measure yourself again each time you go to the next level.</p>
<h3>4) Track Your Progress</h3>
<p>You can record your weight and waist measurement in your profile to track your progress.</p>
<h2>Scoring System</h2>
<p><strong>Workouts:</strong> 3 points each, 15 total for the week</p>
<p><strong>Scripture Reading:</strong> 3 points, 7 days a week, 21 total for the week</p>
<p><strong>Compliant Meals:</strong> 3 points each, 6 days, 3 per day, 54 total for the week</p>
<p><strong>Scripture Memorization:</strong> 10 points</p>
<p><strong>TOTAL SCORE: 100 points</strong></p>
<p><strong>ALL SPARTANS MUST HAVE AN AVERAGE SCORE OF 85 POINTS OR HIGHER TO GRADUATE AND BECOME A SPARTAN FOR LIFE.</strong></p>
<h2>Your First Post</h2>
<p>Your first post will be an intro video.</p>
<p><strong>Tell us:</strong></p>
<ul>
<li>Why you joined Sparta</li>
<li>A little about yourself</li>
<li>What are you expecting to get out of the program</li>
</ul>
`;

export function WelcomePage({ onClose }: WelcomePageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);
  
  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    }
  });

  const { data: pageData } = useQuery<{ pageName: string; content: string | null }>({
    queryKey: ["/api/page-content", "welcome"],
    queryFn: async () => {
      const res = await fetch("/api/page-content/welcome", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch welcome content");
      return res.json();
    },
    enabled: !!user,
  });

  if (!user) {
    return null;
  }

  const handleBackClick = () => {
    if (isSheetMode && onClose) {
      onClose();
    } else {
      navigate("/menu");
    }
  };

  const rawContent = pageData?.content || DEFAULT_WELCOME_HTML;
  const htmlContent = useMemo(() => DOMPurify.sanitize(rawContent), [rawContent]);

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
          <h1 className="text-lg font-semibold">Welcome</h1>
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto ${isAndroid ? 'pb-40' : ''}`}>
        <div className="container py-4 max-w-4xl mx-auto space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <YouTubePlayer videoId="31VqAraWk_w" />
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: htmlContent }} />
            </CardContent>
          </Card>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
