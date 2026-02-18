
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo } from "react";
import { YouTubePlayer } from "@/components/ui/youtube-player";

interface WelcomePageProps {
  onClose?: () => void;
}

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
            data-testid="button-back"
          >
            <ChevronLeft className="h-8 w-8 scale-125" />
          </Button>
          <h1 className="text-lg font-semibold">Welcome</h1>
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto ${isAndroid ? 'pb-40' : ''}`}>
        <div className="container py-4 max-w-4xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Welcome to Sparta Complete Wellness!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <YouTubePlayer videoId="31VqAraWk_w" />
              <p className="text-base">
                Thank you for having the courage and conviction to start this life changing experience. This is the first step of many in the process of getting fit physically, mentally, emotionally, and spiritually.
              </p>
              <p className="text-base">
                You will be in a division with up to 9 other men to make up your Team. You are an important part of this Team. Every time you post a meal pic, commentary, sweaty selfie, you inspire the other men on your Team. In the spirit of competition, and accountability, points will be accumulated by you, and your Team, that will guarantee healthy change for a lifetime.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">1) Take Before Photos</h3>
                <p className="text-muted-foreground text-sm">
                  Take two pictures of yourself, one from the front and one from the side. These will be used for you to document your great results. We will remind you to retake these pictures each time you go to the next level.
                </p>
                <p className="text-muted-foreground text-sm italic mt-1">
                  (You are not required to post these photos. Take pictures dressed in shorts and fitted t-shirt.)
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">2) Weigh Yourself</h3>
                <p className="text-muted-foreground text-sm">
                  Weigh yourself and take a picture of the reading. We know that this is not a true measuring tool of fitness, but it is a measuring tool that we like to track. We will remind you to weigh yourself again each time you go to the next level.
                </p>
                <p className="text-muted-foreground text-sm italic mt-1">
                  (You are not required to post this photo.)
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">3) Measure Your Waist</h3>
                <p className="text-muted-foreground text-sm">
                  Measure yourself around your waist where your belly button is located. Lost inches around the waist is another great measuring tool. We will remind you to measure yourself again each time you go to the next level.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">4) Track Your Progress</h3>
                <p className="text-muted-foreground text-sm">
                  You can record your weight and waist measurement in your profile to track your progress.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Scoring System</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 items-start">
                  <span className="font-medium">Workouts</span>
                  <span className="text-sm text-muted-foreground text-right">3 points each, 15 total for the week</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 items-start">
                  <span className="font-medium">Scripture Reading</span>
                  <span className="text-sm text-muted-foreground text-right">3 points, 7 days a week, 21 total for the week</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 items-start">
                  <span className="font-medium">Compliant Meals</span>
                  <span className="text-sm text-muted-foreground text-right">3 points each, 6 days, 3 per day, 54 total for the week</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 items-start">
                  <span className="font-medium">Scripture Memorization</span>
                  <span className="text-sm text-muted-foreground text-right">10 points</span>
                </div>
                
                <div className="border-t pt-3 mt-3">
                  <div className="grid grid-cols-2 gap-2 items-center font-bold">
                    <span>TOTAL SCORE</span>
                    <span className="text-primary text-right text-xl">100 points</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-center font-bold text-lg">
                ALL SPARTANS MUST HAVE AN AVERAGE SCORE OF 85 POINTS OR HIGHER TO GRADUATE AND BECOME A SPARTAN FOR LIFE.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your First Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Your first post will be an intro video.</p>
              <p className="font-semibold">Tell us:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Why you joined Sparta</li>
                <li>A little about yourself</li>
                <li>What are you expecting to get out of the program</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
