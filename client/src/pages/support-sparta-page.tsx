
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

interface SupportSpartaPageProps {
  onClose?: () => void;
}

export function SupportSpartaPage({ onClose }: SupportSpartaPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);

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
    <div className="flex flex-col h-[100vh]">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
        <div className="container flex items-center p-4 pt-16">
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

      <main className="flex-1 overflow-y-auto pt-32 pb-24">
        <div className="container py-6 max-w-4xl mx-auto">
          <Card className="flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-2xl text-center">Support Our Mission</CardTitle>
              <CardDescription className="text-center text-lg">
                Help us continue building a stronger community
              </CardDescription>
            </CardHeader>
            
            <ScrollArea className="flex-1">
              <CardContent className="space-y-6">
                <div className="text-center mb-4">
                  <p className="mb-4">
                    Your generosity helps us provide resources, equipment, and opportunities 
                    for everyone in our community to grow stronger together.
                  </p>

                  <div className="flex justify-center my-8">
                    <img 
                      src="/SupportSparta.png" 
                      alt="Support Sparta QR Code" 
                      className="max-w-[250px] rounded-md shadow-lg"
                    />
                  </div>
                </div>

                <div className="bg-muted p-6 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">Your Support Matters</h3>
                  <ul className="space-y-2 list-disc pl-5">
                    <li>Provide scholarships for those in financial need</li>
                    <li>Upgrade facilities and equipment</li>
                    <li>Expand programs to reach more community members</li>
                    <li>Host special events that bring us together</li>
                  </ul>
                </div>

                <div className="pt-4">
                  <h3 className="font-bold text-lg mb-2">Ways to Support</h3>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium">One-Time Donation</h4>
                      <p className="text-sm text-muted-foreground">
                        Scan the QR code above to make a quick one-time donation of any amount.
                      </p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium">Monthly Support</h4>
                      <p className="text-sm text-muted-foreground">
                        Become a monthly supporter to help us plan long-term projects and programs.
                      </p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium">Volunteer Your Time</h4>
                      <p className="text-sm text-muted-foreground">
                        Contribute your skills and time to help with events, coaching, and administration.
                      </p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium">Equipment Donations</h4>
                      <p className="text-sm text-muted-foreground">
                        Donate new or gently used sporting equipment to help our athletes train.
                      </p>
                    </div>
                  </div>
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
      
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </div>
  );
}
