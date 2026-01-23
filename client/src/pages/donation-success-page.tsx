import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { queryClient } from "@/lib/queryClient";

export default function DonationSuccessPage() {
  const [, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (sessionId) {
      fetch(`/api/stripe/donation-session/${sessionId}`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'paid') {
            setVerified(true);
            queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          }
        })
        .catch(console.error)
        .finally(() => setIsVerifying(false));
    } else {
      setIsVerifying(false);
    }
  }, []);

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {isVerifying ? (
              <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto mb-4" />
            ) : (
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            )}
            <CardTitle className="text-2xl">
              {isVerifying ? "Verifying Payment..." : "Thank You for Your Donation!"}
            </CardTitle>
            <CardDescription>
              {isVerifying 
                ? "Please wait while we confirm your payment..."
                : "Your generous donation helps support the Sparta Complete Wellness program."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isVerifying && verified && (
              <p className="text-sm text-muted-foreground">
                You now have access to create your own Organization, Group, and Team. 
                Head over to the invite code page to get started!
              </p>
            )}
            <Button 
              className="w-full" 
              onClick={() => setLocation("/invite-code")}
              disabled={isVerifying}
            >
              {verified ? "Create Your Team" : "Continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
