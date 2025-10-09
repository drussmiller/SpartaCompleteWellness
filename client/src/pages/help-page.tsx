import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Book, Dumbbell, Cross, Award } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AchievementDemo } from "@/components/achievements/achievement-demo";

export default function HelpPage() {
  return (
    <AppLayout>
      {/* Fixed title bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-background">
        {/* This div is an empty spacer, which you can style as necessary */}
      </div>
      <div className="fixed top-10 left-0 right-0 z-50 h-16 bg-background border-b border-border">
        <div className="p-4 px-4 md:px-44 md:pl-80">
          <h1 className="text-xl font-bold">Help</h1>
        </div>
      </div>

      <main className="p-4 pb-24 space-y-4 max-w-[1000px] mx-auto w-full text-lg md:px-44 md:pl-56 pt-8 md:pt-28">
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
              <li>Your administrator will assign you to a team</li>
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
              <li>Regular weight measurements</li>
              <li>Waist measurements</li>
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
      </main>
    </AppLayout>
  );
}