import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Bell, Settings, Trophy, Heart } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import ProfilePage from "./profile-page";
import AdminPage from "./admin-page";
import { LeaderboardPage } from "./leaderboard-page";
import { SupportSpartaPage } from "./support-sparta-page";
import { NotificationSettings } from "@/components/notification-settings";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function MenuPage() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [supportSpartaOpen, setSupportSpartaOpen] = useState(false);
  const [, navigate] = useLocation();

  const menuItems = [
    {
      title: "My Profile",
      description: "View and edit your profile",
      href: "/profile",
      icon: "👤",
      action: () => setProfileOpen(true)
    },
    {
      title: "Activity",
      description: "Track your daily activities",
      href: "/activity",
      icon: "📊",
      requiresTeam: true
    },
    {
      title: "Leaderboard",
      description: "See team rankings and points",
      href: "/leaderboard",
      icon: "🏆",
      requiresTeam: true,
      action: () => setLeaderboardOpen(true)
    },
    {
      title: "Prayer Requests",
      description: "Share and view prayer requests",
      href: "/prayer-requests",
      icon: "🙏",
      requiresTeam: true
    },
    {
      title: "Notifications",
      description: "Manage your notifications",
      href: "/notifications",
      icon: "🔔",
      requiresTeam: true
    },
    {
      title: "Notification Settings",
      description: "Configure notification preferences",
      icon: "⚙️",
      requiresTeam: true,
      action: () => setNotificationSettingsOpen(true)
    },
    {
      title: "Help",
      description: "Get help and support",
      href: "/help",
      icon: "❓"
    },
    {
      title: "Support Sparta",
      description: "Support our community",
      href: "/support-sparta",
      icon: "💝",
      action: () => setSupportSpartaOpen(true)
    }
  ];

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

        

        <div className="space-y-6">
          {/* User Profile */}
          <Button
            variant="outline"
            className="w-full h-20 justify-start text-left p-6"
            onClick={() => setProfileOpen(true)}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">👤</div>
              <div>
                <div className="font-semibold">My Profile</div>
                <div className="text-sm text-muted-foreground">View and edit your profile</div>
              </div>
            </div>
          </Button>

          {/* Support Sparta */}
          <Button
            variant="outline"
            className="w-full h-20 justify-start text-left p-6"
            onClick={() => setSupportSpartaOpen(true)}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">💝</div>
              <div>
                <div className="font-semibold">Support Sparta</div>
                <div className="text-sm text-muted-foreground">Support our community</div>
              </div>
            </div>
          </Button>

          {/* Notifications - Disabled for users without team */}
          <Button
            variant="outline"
            className={`w-full h-20 justify-start text-left p-6 ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!user?.teamId}
            title={!user?.teamId ? "Requires team assignment" : undefined}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">🔔</div>
              <div>
                <div className="font-semibold">Notifications</div>
                <div className="text-sm text-muted-foreground">
                  {!user?.teamId ? "Requires team assignment" : "Manage your notifications"}
                </div>
              </div>
            </div>
          </Button>

          {/* Settings - Disabled for users without team */}
          <Button
            variant="outline"
            className={`w-full h-20 justify-start text-left p-6 ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!user?.teamId}
            onClick={user?.teamId ? () => setNotificationSettingsOpen(true) : undefined}
            title={!user?.teamId ? "Requires team assignment" : undefined}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">⚙️</div>
              <div>
                <div className="font-semibold">Notification Settings</div>
                <div className="text-sm text-muted-foreground">
                  {!user?.teamId ? "Requires team assignment" : "Configure notification preferences"}
                </div>
              </div>
            </div>
          </Button>

          {/* Leaderboard - Disabled for users without team */}
          <Button
            variant="outline"
            className={`w-full h-20 justify-start text-left p-6 ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!user?.teamId}
            onClick={user?.teamId ? () => setLeaderboardOpen(true) : undefined}
            title={!user?.teamId ? "Requires team assignment" : undefined}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">🏆</div>
              <div>
                <div className="font-semibold">Leaderboard</div>
                <div className="text-sm text-muted-foreground">
                  {!user?.teamId ? "Requires team assignment" : "See team rankings and points"}
                </div>
              </div>
            </div>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}