import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Book, Dumbbell, Cross, Award, Bell } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AchievementDemo } from "@/components/achievements/achievement-demo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function HelpPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const testNotificationMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not found");
      const response = await apiRequest("POST", `/api/test-notification/${user.id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Notification Sent",
        description: "Check your notifications to see if you would receive a reminder based on today's activity.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to send test notification",
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className="text-xl font-bold">Help</h1>
        </div>
      </div>

      <main className="pb-28 space-y-4 max-w-2xl mx-auto w-full p-6 text-lg">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Welcome to Sparta Complete Wellness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Thank you for having the courage and conviction to start this life changing experience.  This is the first step of many in the process of getting fit physically, mentally, emotionally, and spiritually.</p>
            <p>Proverbs 16:9 "The heart of man plans his way, but the Lord establishes his steps.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>You wiil be provided an invite code or you will be placed in a Team. You are an important part of this Team. Every time you post a meal pic, commentary, sweaty selfie, you inspire the other men on your Team. In the spirit of competition, and accountability, points will be accumulated by you, and your Team, that will guarantee healthy change for a lifetime.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Take two pictures of yourself, one from the front and one from the side. These will be used for you to document your great results. We will remind you to retake these picture each time you go to the next level.<br />
               (You are not required to post these photos.  Take pictures dressed in shorts and fitted t-shirt.)</li>
              <li>Start sharing your wellness journey through posts</li>
              <li>Track your measurements in your profile</li>
              <li>Engage with your team members</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Welcome to Sparta Complete Wellness! Here's how to get started:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You will be provided an invite code to join a team or your administrator will assign you to a team</li>
              <li>Start sharing your wellness journey through posts</li>
              <li>Track your measurements in your profile</li>
              <li>Engage with your team members</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="h-5 w-5" />
              Posting Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <h3 className="font-semibold">Types of Posts:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Food (3 points):</strong> Share your healthy meals with a photo</li>
              <li><strong>Workout (3 points):</strong> Document your exercise with a photo</li>
              <li><strong>Scripture (3 points):</strong> Share inspiring biblical verses</li>
              <li><strong>Memory Verse (10 points):</strong> Weekly scripture memorization</li>
              <li><strong>Comments:</strong> Engage with other posts</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />
              Fitness Tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Track your fitness progress through:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Regular weight and waist measurements</li>
              <li>Progress graphs in your profile</li>
              <li>Daily activity posts</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cross className="h-5 w-5" />
              Spiritual Growth
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Enhance your spiritual journey by:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Sharing daily scripture readings</li>
              <li>Memorizing weekly verses</li>
              <li>Engaging in spiritual discussions</li>
              <li>Supporting team members through prayer and encouragement</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Earn achievements by reaching milestones in your wellness journey:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Complete a streak of consistent food posts</li>
              <li>Finish all your workouts for the week</li>
              <li>Maintain a daily scripture reading habit</li>
              <li>Successfully memorize and share weekly verses</li>
              <li>Help your team reach collective goals</li>
            </ul>

            <AchievementDemo />
          </CardContent>
        </Card>

        {/* Admin Test Notification Button */}
        {user?.isAdmin && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Bell className="h-5 w-5" />
                Admin Testing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Test the notification system to see if you would receive a daily reminder
                based on today's posting activity. The test simulates checking at your preferred notification time.
              </p>
              <Button
                onClick={() => testNotificationMutation.mutate()}
                disabled={testNotificationMutation.isPending}
                className="w-full"
                data-testid="button-test-notification"
              >
                {testNotificationMutation.isPending ? "Sending..." : "Test Notification"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </AppLayout>
  );
}