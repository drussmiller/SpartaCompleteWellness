import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Bell, Settings, Trophy, Heart, QrCode, Users, MessageSquare, Shield } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import ProfilePage from "./profile-page";
import AdminPage from "./admin-page";
import { LeaderboardPage } from "./leaderboard-page";
import { SupportSpartaPage } from "./support-sparta-page";
import { FeedbackPage } from "./feedback-page";
import { PrivacyPolicyPage } from "./privacy-policy-page";
import InviteCodePage from "./invite-code-page";
import { NotificationSettings } from "@/components/notification-settings";
import { WelcomePage } from "./welcome-page";
import { useState } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";

export default function MenuPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  console.log('[MENU PAGE] User avatar color:', user?.avatarColor);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [supportSpartaOpen, setSupportSpartaOpen] = useState(false);
  const [privacyPolicyOpen, setPrivacyPolicyOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [inviteCodeOpen, setInviteCodeOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [location, setLocation] = useLocation();
  
  // Check if user has posted an introductory video
  const { data: introVideoPosts = [] } = useQuery({
    queryKey: ["/api/posts", "introductory_video", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/posts?type=introductory_video&userId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data.posts ?? []);
    },
    enabled: !!user,
    staleTime: 30000,
  });
  
  const hasPostedIntroVideo = introVideoPosts.length > 0;

  if (!user) return null;

  return (
    <AppLayout>
      <div className="flex flex-col min-h-0 select-none">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
          <div className="max-w-2xl mx-auto p-4">
            <h1 className={`text-xl font-bold ${!isMobile ? 'pl-16' : ''}`}>Menu</h1>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="max-w-2xl mx-auto w-full pl-6 pr-4 py-6 space-y-2 mt-[40px] md:mt-[100px] mb-20">
          {/* Profile Sheet */}
          <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start py-6 active:bg-background focus:bg-background" size="lg">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-8 w-8">
                    {user.imageUrl && <AvatarImage src={user.imageUrl} alt={user.username} />}
                    <AvatarFallback
                      style={{ backgroundColor: user.avatarColor || '#6366F1' }}
                      className="text-white"
                    >
                      {user.username?.[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <div className="font-medium">{user.preferredName || user.username}</div>
                  </div>
                </div>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {profileOpen && <ProfilePage onClose={() => setProfileOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Welcome */}
          <Sheet open={welcomeOpen} onOpenChange={setWelcomeOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start active:bg-background focus:bg-background" size="lg">
                <Users className="mr-2 h-5 w-5" />
                Welcome
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {welcomeOpen && <WelcomePage onClose={() => setWelcomeOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Notification Settings */}
          <Sheet open={notificationSettingsOpen} onOpenChange={setNotificationSettingsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className={`w-full justify-start active:bg-background focus:bg-background ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
                size="lg"
                disabled={!user?.teamId}
              >
                <Bell className="mr-2 h-5 w-5" />
                Notification Settings
                {!user?.teamId && <span className="ml-auto text-xs text-muted-foreground">(Team Required)</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {notificationSettingsOpen && <NotificationSettings onClose={() => setNotificationSettingsOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Leaderboard - Changed to slide in from right */}
          <Sheet open={leaderboardOpen} onOpenChange={setLeaderboardOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className={`w-full justify-start active:bg-background focus:bg-background ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
                size="lg"
                disabled={!user?.teamId}
              >
                <Trophy className="mr-2 h-5 w-5" />
                Leaderboard
                {!user?.teamId && <span className="ml-auto text-xs text-muted-foreground">(Team Required)</span>}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {leaderboardOpen && <LeaderboardPage onClose={() => setLeaderboardOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Support Sparta */}
          <Sheet open={supportSpartaOpen} onOpenChange={setSupportSpartaOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start active:bg-background focus:bg-background" size="lg">
                <Heart className="mr-2 h-5 w-5" />
                Support Sparta
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {supportSpartaOpen && <SupportSpartaPage onClose={() => setSupportSpartaOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Privacy Policy */}
          <Sheet open={privacyPolicyOpen} onOpenChange={setPrivacyPolicyOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start active:bg-background focus:bg-background" size="lg" data-testid="button-privacy-policy">
                <Shield className="mr-2 h-5 w-5" />
                Privacy Policy
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {privacyPolicyOpen && <PrivacyPolicyPage onClose={() => setPrivacyPolicyOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Feedback */}
          <Sheet open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start active:bg-background focus:bg-background" size="lg" data-testid="button-feedback">
                <MessageSquare className="mr-2 h-5 w-5" />
                Feedback
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
              {feedbackOpen && <FeedbackPage onClose={() => setFeedbackOpen(false)} />}
            </SheetContent>
          </Sheet>

          {/* Join a Team - Hide for Group Admins, Team Leads, and users in teams */}
          {!user.isGroupAdmin && !user.isTeamLead && !user.teamId && (
            <Sheet open={inviteCodeOpen} onOpenChange={setInviteCodeOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-start active:bg-background focus:bg-background" 
                  size="lg" 
                  data-testid="button-join-team"
                  disabled={!hasPostedIntroVideo}
                  title={!hasPostedIntroVideo ? "Post your intro video first" : ""}
                >
                  <Users className="mr-2 h-5 w-5" />
                  Join a Team
                  {!hasPostedIntroVideo && <span className="ml-auto text-xs text-muted-foreground">(Intro Video required)</span>}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0">
                {inviteCodeOpen && <InviteCodePage onClose={() => setInviteCodeOpen(false)} />}
              </SheetContent>
            </Sheet>
          )}

          {/* Admin Sheet - Only shown for admin users */}
          {(user.isAdmin || user.isGroupAdmin || user.isTeamLead) && (
            <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-start active:bg-background focus:bg-background" size="lg">
                  <Settings className="mr-2 h-5 w-5" />
                  Admin Dashboard
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 md:left-[calc(50vw+40px)] md:-translate-x-1/2 md:right-auto">
                {adminOpen && <AdminPage onClose={() => setAdminOpen(false)} />}
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </AppLayout>
  );
}