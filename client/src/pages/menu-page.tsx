import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Bell, Settings, Trophy, Heart, User, Shield, Bug, LogOut } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import ProfilePage from "./profile-page";
import AdminPage from "./admin-page";
import { LeaderboardPage } from "./leaderboard-page";
import { SupportSpartaPage } from "./support-sparta-page";
import { NotificationSettings } from "@/components/notification-settings";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default function MenuPage() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [supportSpartaOpen, setSupportSpartaOpen] = useState(false);
  const [, navigate] = useLocation();

  // Placeholder for userTeam, assuming it's fetched elsewhere or derived from user object
  // For this example, we'll use a mock value or derive it from user.teamId
  const userTeam = user?.teamId ? { name: "Your Team Name" } : null; // Replace with actual team fetching logic if needed

  const handleSignOut = () => {
    // Implement sign out logic here
    console.log("Signing out...");
    // Example: Call an auth signOut function
    // signOut();
  };

  if (!user) return null;

  return (
    <AppLayout>
      <div className="flex flex-col p-6 md:px-44 md:pl-56">
        <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-background">
          {/* This div is an empty spacer, which you can style as necessary */}
        </div>
        <div className="fixed top-10 z-50 left-0 right-0 bg-background border-b border-border text-lg">
          <div className="p-4">
            <h1 className="text-xl font-bold">Menu</h1>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={user?.imageUrl || ""} />
                  <AvatarFallback className="text-xl">
                    {user?.username?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{user?.username}</h2>
                  <p className="text-muted-foreground">{user?.email}</p>
                  {userTeam ? (
                    <p className="text-sm font-medium text-primary mt-1">
                      Team: {userTeam.name}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      No team assigned yet
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-2">
            <Link
              href="/profile"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "justify-start h-12"
              )}
            >
              <User className="mr-2 h-4 w-4" />
              Profile
            </Link>

            <Link
              href="/support-sparta"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "justify-start h-12"
              )}
            >
              <Heart className="mr-2 h-4 w-4" />
              Support Sparta
            </Link>

            {/* Only show team-related features if user has a team */}
            {user?.teamId && (
              <>
                <Link
                  href="/leaderboard"
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "justify-start h-12"
                  )}
                >
                  <Trophy className="mr-2 h-4 w-4" />
                  Leaderboard
                </Link>

                <Link
                  href="/notification-settings"
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "justify-start h-12"
                  )}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Notification Settings
                </Link>
              </>
            )}

            {user?.isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "justify-start h-12"
                )}
              >
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </Link>
            )}

            <Link
              href="/debug"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "justify-start h-12"
              )}
            >
              <Bug className="mr-2 h-4 w-4" />
              Debug API
            </Link>

            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="justify-start h-12 text-destructive hover:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}