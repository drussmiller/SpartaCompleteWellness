import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { ChevronLeft, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { BottomNav } from "@/components/bottom-nav";

interface SupportSpartaPageProps {
  onClose?: () => void;
}

export function SupportSpartaPage({ onClose }: SupportSpartaPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose); // If onClose is provided, we're in sheet mode

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
    // Open donation QR code in a new tab or window
    window.open("https://donate.sparta.team", "_blank");
  };

  return (
    <div className="flex flex-col min-h-screen pb-16 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
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

      <div className="container py-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-center">Support Our Mission</CardTitle>
            <CardDescription className="text-center text-lg">
              Help us continue building a stronger community
            </CardDescription>
          </CardHeader>
          
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

              <Button 
                size="lg" 
                className="mt-4 gap-2"
                onClick={handleDonateClick}
              >
                <Heart className="h-5 w-5" />
                Donate Now
              </Button>
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
          </CardContent>
          
          <CardFooter className="flex justify-center text-center text-sm text-muted-foreground">
            <p>
              Sparta is a 501(c)(3) nonprofit organization. 
              All donations are tax-deductible.
            </p>
          </CardFooter>
        </Card>
      </div>
      
      <BottomNav />
    </div>
  );
}