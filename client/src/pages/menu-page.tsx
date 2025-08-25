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

        

        {/* Home Page Section */}
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Home</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {menuItems.map((item) => {
              const isDisabled = item.requiresTeam && !user?.teamId;
              const key = item.href || item.title;

              if (isDisabled) {
                return (
                  <div key={key}>
                    <Card className="h-full opacity-50 cursor-not-allowed">
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="text-2xl">{item.icon}</div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg mb-1">{item.title}</h3>
                            <p className="text-muted-foreground text-sm">{item.description}</p>
                            <p className="text-xs text-red-500 mt-1">Requires team assignment</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              if (item.action) {
                return (
                  <div key={key} onClick={item.action}>
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="text-2xl">{item.icon}</div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg mb-1">{item.title}</h3>
                            <p className="text-muted-foreground text-sm">{item.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              return (
                <Link key={key} href={item.href!}>
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="text-2xl">{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg mb-1">{item.title}</h3>
                          <p className="text-muted-foreground text-sm">{item.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}