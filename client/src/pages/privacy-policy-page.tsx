import { useLocation } from "wouter";
import { ChevronLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { BottomNav } from "@/components/bottom-nav";

interface PrivacyPolicyPageProps {
  onClose?: () => void;
}

export function PrivacyPolicyPage({ onClose }: PrivacyPolicyPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);

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
            data-testid="button-back-privacy"
          >
            <ChevronLeft className="h-8 w-8 scale-125" />
          </Button>
          <h1 className="text-lg font-semibold">Privacy Policy</h1>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h2 className="text-2xl font-bold">Privacy Policy</h2>
          </div>
          
          <p className="text-muted-foreground text-sm">
            Last updated: December 15, 2025
          </p>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">1. Introduction</h3>
            <p className="text-muted-foreground">
              Welcome to Sparta Complete Wellness ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and related services.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">2. Information We Collect</h3>
            <div className="space-y-2">
              <h4 className="font-medium">Personal Information</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Name, email address, and username</li>
                <li>Profile photo (optional)</li>
                <li>Team affiliation and group membership</li>
                <li>Activity and wellness data you choose to log</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Automatically Collected Information</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Device type and operating system</li>
                <li>App usage statistics and interaction data</li>
                <li>Push notification preferences</li>
              </ul>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">3. How We Use Your Information</h3>
            <p className="text-muted-foreground">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Provide, maintain, and improve our services</li>
              <li>Track your wellness activities and progress</li>
              <li>Enable team collaboration and leaderboard features</li>
              <li>Send notifications about your activities and achievements</li>
              <li>Respond to your feedback and support requests</li>
              <li>Ensure the security and integrity of our platform</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">4. Information Sharing</h3>
            <p className="text-muted-foreground">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li><strong>Within Your Team:</strong> Your activity data and achievements may be visible to other members of your team and group administrators</li>
              <li><strong>Service Providers:</strong> We may share information with trusted third-party services that help us operate our platform</li>
              <li><strong>Legal Requirements:</strong> We may disclose information when required by law or to protect our rights and safety</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">5. Data Security</h3>
            <p className="text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. This includes encryption, secure servers, and regular security assessments.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">6. Data Retention</h3>
            <p className="text-muted-foreground">
              We retain your personal information for as long as your account is active or as needed to provide you services. You may request deletion of your account and associated data at any time by contacting your team administrator or our support team.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">7. Your Rights</h3>
            <p className="text-muted-foreground">You have the right to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Access and receive a copy of your personal data</li>
              <li>Correct inaccurate or incomplete information</li>
              <li>Request deletion of your personal data</li>
              <li>Opt out of certain data processing activities</li>
              <li>Withdraw consent where processing is based on consent</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">8. Children's Privacy</h3>
            <p className="text-muted-foreground">
              Our services are intended for users who are at least 13 years of age. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13, we will take steps to delete that information.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">9. Push Notifications</h3>
            <p className="text-muted-foreground">
              We may send you push notifications to remind you about activities, celebrate achievements, or share important updates. You can manage your notification preferences in the app settings or through your device settings at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">10. Changes to This Policy</h3>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">11. Contact Us</h3>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy or our data practices, please contact us through the Feedback feature in the app or reach out to your team administrator.
            </p>
          </section>

          <div className="pt-6 border-t">
            <p className="text-sm text-muted-foreground text-center">
              By using Sparta Complete Wellness, you agree to the terms outlined in this Privacy Policy.
            </p>
          </div>
        </div>
      </ScrollArea>

      {!isSheetMode && (
        <div className="flex-shrink-0">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
