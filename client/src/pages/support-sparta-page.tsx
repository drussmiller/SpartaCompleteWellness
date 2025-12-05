
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { ChevronLeft, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { BottomNav } from "@/components/bottom-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { useMemo } from "react";

interface SupportSpartaPageProps {
  onClose?: () => void;
}

export function SupportSpartaPage({ onClose }: SupportSpartaPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);
  const [showDonation, setShowDonation] = useState(false);
  
  // Detect Android device for bottom padding adjustment
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

  const handleDonateClick = () => {
    window.open("https://donate.sparta.team", "_blank");
  };

  return (
    <div 
      className="flex flex-col h-[100vh]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-swipe-enabled="true"
    >
      <header className="sticky top-0 z-50 bg-background border-b border-border pt-12">
        <div className="flex items-center p-4">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 scale-125"
            onClick={handleBackClick}
          >
            <ChevronLeft className="h-8 w-8 scale-125" />
          </Button>
          <h1 className="text-lg font-semibold">Support Sparta</h1>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto pb-24 ${isAndroid ? 'pb-[calc(24+40)px]' : ''}`}>
        <div className="py-6 px-4 max-w-4xl mx-auto">
          <Card className="flex flex-col">
            <ScrollArea className="flex-1">
              <CardContent className="space-y-6">
                <div className="text-center mb-4">

                  <div className="aspect-w-16 aspect-h-9 mb-8">
                    <iframe
                      src="https://www.youtube.com/embed/zTidZXChF7w?rel=0&modestbranding=1"
                      title="Sparta Support Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-[300px] rounded-lg shadow-lg"
                    ></iframe>
                  </div>

                  <div className="flex justify-center my-8">
                    <img 
                      src="/SupportSparta.png" 
                      alt="Support Sparta QR Code" 
                      className="max-w-[250px] rounded-md shadow-lg cursor-pointer"
                      onClick={() => setShowDonation(true)}
                    />
                  </div>
                  
                  {showDonation && (
                    <div className="fixed inset-0 bg-background z-500 flex flex-col pt-28">
                      <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold">Make a Donation</h2>
                        <Button variant="ghost" size="sm" onClick={() => setShowDonation(false)}>
                          Close
                        </Button>
                      </div>
                      <iframe
                        src="https://donorbox.org/sparta-complete-wellness-sponsorship-donation"
                        className="w-full flex-1"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </ScrollArea>
            
            <CardFooter className="flex-shrink-0 flex justify-center text-center text-sm text-muted-foreground mt-4 border-t pt-4">
              <p>
                Sparta is a 501(c)(3) nonprofit organization. 
                All donations are tax-deductible.
              </p>
            </CardFooter>
          </Card>
        </div>
      </main>
      
      
    </div>
  );
}
