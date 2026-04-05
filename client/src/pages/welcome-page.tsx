import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { YouTubePlayer } from "@/components/ui/youtube-player";
import DOMPurify from "isomorphic-dompurify";

interface WelcomePageProps {
  onClose?: () => void;
}

function splitIntoSections(html: string): { title: string; content: string }[] {
  const parts = html.split(/<h2[^>]*>/i);
  const sections: { title: string; content: string }[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    const h2EndMatch = part.match(/<\/h2>/i);
    if (h2EndMatch && h2EndMatch.index !== undefined) {
      const title = part.substring(0, h2EndMatch.index).replace(/<[^>]*>/g, '').trim();
      const content = part.substring(h2EndMatch.index + 5).trim();
      sections.push({ title, content });
    } else {
      if (sections.length > 0) {
        sections[sections.length - 1].content += part;
      } else {
        sections.push({ title: "", content: part });
      }
    }
  }

  return sections;
}

function DefaultWelcomeContent({ videoId }: { videoId: string }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Welcome to Sparta Complete Wellness!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <YouTubePlayer videoId={videoId} />
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
    </>
  );
}

function DynamicWelcomeContent({ htmlContent, videoId }: { htmlContent: string; videoId: string }) {
  const sanitizedContent = useMemo(() => DOMPurify.sanitize(htmlContent), [htmlContent]);
  const sections = useMemo(() => splitIntoSections(sanitizedContent), [sanitizedContent]);

  return (
    <>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <YouTubePlayer videoId={videoId} />
        </CardContent>
      </Card>
      {sections.map((section, index) => (
        <Card key={index}>
          {section.title && (
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">{section.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className="space-y-4 prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: section.content }} />
          </CardContent>
        </Card>
      ))}
    </>
  );
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

  const { data: pageData } = useQuery<{ pageName: string; content: string | null; youtubeVideoId: string | null }>({
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

  const hasCustomContent = pageData?.content && pageData.content.trim().length > 0;
  const videoId = pageData?.youtubeVideoId || "31VqAraWk_w";

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
          {hasCustomContent ? (
            <DynamicWelcomeContent htmlContent={pageData!.content!} videoId={videoId} />
          ) : (
            <DefaultWelcomeContent videoId={videoId} />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Meal Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-base font-semibold">
                Here is what makes Level 1 meals an approved meal. Do NOT consume these two items:
              </p>
              <div className="space-y-1">
                <p className="font-bold text-destructive">1) NO Simple sugars</p>
                <p className="font-bold text-destructive">2) NO Dairy products</p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-bold text-base">1) NO Simple Sugars</h3>
                <p className="text-sm text-muted-foreground">
                  Carbohydrates (sugars) are a component of food that supplies energy through calories to the body. The energy value of digestible carbohydrates is four calories per gram. Along with proteins and fats, carbohydrates are one of the three macronutrients that your body needs. We need all three to be healthy.
                </p>
                <p className="text-sm text-muted-foreground">
                  The two basic types of carbohydrates that we consume daily are Starches, called <span className="font-semibold text-foreground">Complex carbohydrates (whole)</span> and sugars, called <span className="font-semibold text-foreground">Simple carbohydrates (refined)</span>. Whole carbs are unprocessed and contain the fiber found naturally in the food, while refined carbs have been processed and had the natural fiber stripped out.
                </p>
                <p className="text-sm text-muted-foreground">
                  Examples of whole carbs include vegetables, whole fruit, legumes, sweet potatoes and whole grains used for sustained energy. These foods are healthy. Refined carbs include sugar-sweetened beverages, fruit juices, pastries, bread, white pasta, white rice and others causing major spikes in blood sugar levels, which leads to a crash that can trigger hunger and cravings for more simple carb foods.
                </p>
                <p className="text-sm text-muted-foreground italic">
                  This is the "blood sugar roller coaster" that many people are familiar with.
                </p>
                <p className="text-sm text-muted-foreground font-semibold">
                  Only whole carbs for you on this journey. By whole, we mean single ingredient foods in their original form: not mixed or processed with preservatives.
                </p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-semibold text-base">Fuel Foods to eat that contain NO unhealthy Simple sugars:</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-1">All Vegetables</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Spinach</li>
                      <li>Kale</li>
                      <li>Carrots</li>
                      <li>Broccoli</li>
                      <li>Chard</li>
                      <li>Ginger</li>
                      <li>Sweet potatoes</li>
                      <li>Red potatoes</li>
                      <li>Squash</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-1">Whole Fruits</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Berries (blueberries, blackberries, raspberries, strawberries, cranberries)</li>
                      <li>Apples</li>
                      <li>Bananas</li>
                      <li>Grapefruits</li>
                      <li>Grapes</li>
                      <li>Pomegranate</li>
                      <li>Cherries</li>
                      <li>Avocados</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-1">Legumes</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Beans</li>
                      <li>Peas</li>
                      <li>Lentils</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-1">Nuts</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Almonds</li>
                      <li>Walnuts</li>
                      <li>Cashews</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-1">Seeds</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Chia</li>
                      <li>Pumpkin</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm mb-1">Whole Grains</h4>
                    <ul className="text-sm text-muted-foreground space-y-0.5 list-disc pl-4">
                      <li>Quinoa</li>
                      <li>Brown rice</li>
                      <li>Whole grain oats</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-bold text-base">2) NO Dairy Products</h3>
                <p className="text-sm text-muted-foreground">
                  The definition of dairy includes foods produced from the milk of mammals, such as cows, sheep, goats. Milk and any food products made from milk, such as cheese, cream, butter, milk yogurt, etc... <span className="font-semibold text-foreground">(eggs are NOT dairy)</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
