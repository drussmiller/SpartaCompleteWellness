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
      icon: "👤"
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
      requiresTeam: true
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
      title: "Help",
      description: "Get help and support",
      href: "/help",
      icon: "❓"
    },
    {
      title: "Support Sparta",
      description: "Support our community",
      href: "/support-sparta",
      icon: "💝"
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

        {/* Navigation Section */}
        <div className="w-full space-y-2">
          {/* Profile Sheet */}
          <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start py-6" size="lg">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`}
                      alt={user.username}
                    />
                    <AvatarFallback>
                      {user.username?.[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <div className="font-medium">{user.preferredName || user.username}</div>
                  </div>
                </div>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[640px] p-0">
              {profileOpen && <ProfilePage onClose={() => setProfileOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Notification Settings */}
          <Sheet open={notificationSettingsOpen} onOpenChange={setNotificationSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <Bell className="mr-2 h-5 w-5" />
                Notification Settings
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[640px] p-0">
              {notificationSettingsOpen && <NotificationSettings onClose={() => setNotificationSettingsOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Leaderboard - Changed to slide in from right */}
          <Sheet open={leaderboardOpen} onOpenChange={setLeaderboardOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <Trophy className="mr-2 h-5 w-5" />
                Leaderboard
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[640px] p-0">
              {leaderboardOpen && <LeaderboardPage onClose={() => setLeaderboardOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Support Sparta */}
          <Sheet open={supportSpartaOpen} onOpenChange={setSupportSpartaOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start" size="lg">
                <Heart className="mr-2 h-5 w-5" />
                Support Sparta
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[640px] p-0">
              {supportSpartaOpen && <SupportSpartaPage onClose={() => setSupportSpartaOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Admin Sheet - Only shown for admin users */}
          {user.isAdmin && (
            <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-start" size="lg">
                  <Settings className="mr-2 h-5 w-5" />
                  Admin Dashboard
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[640px] p-0">
                {adminOpen && <AdminPage onClose={() => setAdminOpen(false)} />}
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Home Page Section */}
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Home</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {menuItems.map((item) => {
              const isDisabled = item.requiresTeam && !user?.teamId;

              if (isDisabled) {
                return (
                  <div key={item.href}>
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

              return (
                <Link key={item.href} href={item.href}>
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