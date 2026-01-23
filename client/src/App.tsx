import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { AchievementsProvider } from "@/hooks/use-achievements";
import { Toaster } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import RegisterPage from "@/pages/register-page";
import HomePage from "@/pages/home-page";
import ActivityPage from "@/pages/activity-page";
import ActivityManagementPage from "@/pages/activity-management";
import HelpPage from "@/pages/help-page";
import NotificationsPage from "@/pages/notifications-page";
import ProfilePage from "@/pages/profile-page";
import AdminPage from "@/pages/admin-page";
import GroupAdminPage from "@/pages/group-admin-page";
import MenuPage from "@/pages/menu-page";
import { BottomNav } from "@/components/bottom-nav";
import { VerticalNav } from "@/components/vertical-nav";
import NotificationSettingsPage from "@/pages/notification-settings-page";
import NotificationSchedulePage from "@/pages/notification-schedule-page";
import { LeaderboardPage } from "@/pages/leaderboard-page";
import { DebugApi } from "./debug-api";
import { AchievementsContainer } from "@/components/achievements/achievements-container";
import PrayerRequestsPage from "@/pages/prayer-requests-page";

import { VideoPlayerPage } from "./pages/video-player-page";
import CommentsPage from "@/pages/comments-page";
import { lazy } from "react";
import WaiverPage from "@/pages/waiver-page";
import DonationSuccessPage from "@/pages/donation-success-page";

// Separate auth-dependent rendering
function MainContent() {
  const { user, isLoading, error } = useAuth();
  console.log('MainContent rendering - auth state:', { user, isLoading, error });

  // Minimal browser navigation prevention - only block very edge browser swipes
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const veryLeftEdge = touch.clientX < 15; // Very narrow edge for browser navigation

      // Only block browser navigation swipes from the very edge on pages without swipe handlers
      if (veryLeftEdge) {
        const hasSwipeEnabled = document.querySelector('[data-swipe-enabled="true"]');

        if (!hasSwipeEnabled) {
          console.log('Blocking browser navigation swipe from edge');
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    };

    // Only intercept the very edge to prevent browser navigation
    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Error</h1>
          <p className="mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show auth or register page based on route
  if (!user) {
    return (
      <Switch>
        <Route path="/register" component={RegisterPage} />
        <Route path="*" component={AuthPage} />
      </Switch>
    );
  }

  // Check if user needs to sign waiver first
  if (user && !user.waiverSigned && window.location.pathname !== '/waiver') {
    // Immediately redirect to waiver page
    window.location.href = '/waiver';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Redirecting to waiver...</h1>
        </div>
      </div>
    );
  }

  // If authenticated, show the app with routes
  return (
    <div className="min-h-screen">
      {user && <div className="fixed left-0 top-0 z-[100]"><VerticalNav /></div>}
      <div className="md:pl-20" style={{overflowX: 'hidden', touchAction: 'pan-y pinch-zoom', overscrollBehaviorX: 'contain'}}> {/* Prevent horizontal overscroll */}
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/waiver" component={WaiverPage} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/activity-management" component={ActivityManagementPage} />
          <Route path="/notification-settings" component={NotificationSettingsPage} />
          {/* Keep for backward compatibility */}
          <Route path="/notification-schedule" component={NotificationSettingsPage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/help" component={HelpPage} />
          <Route path="/menu" component={MenuPage} />
          <Route path="/leaderboard" component={() => <LeaderboardPage />} />
          <Route path="/prayer-requests" component={PrayerRequestsPage} />
          <Route path="/debug" component={() => <DebugApi />} />

          <Route path="/video-player" component={() => <VideoPlayerPage />} />
          <Route path="/comments/:postId">
            <CommentsPage />
          </Route>
          <Route path="/donation-success" component={DonationSuccessPage} />
          {user.isAdmin && <Route path="/admin" component={() => <AdminPage />} />}
          {user.isGroupAdmin && <Route path="/group-admin" component={() => <GroupAdminPage />} />}
          <Route path="*">Not found</Route>
        </Switch>
      </div>
    </div>
  );
}

function App() {
  console.log('App component rendering');

  // Android-specific: Set CSS custom property for safe padding that persists across component remounts
  useEffect(() => {
    const isAndroid = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('android');
    if (!isAndroid) return;

    const root = document.documentElement;
    
    // Check if already backgrounded from sessionStorage
    const wasBackgrounded = sessionStorage.getItem('androidBackgrounded') === 'true';
    if (wasBackgrounded) {
      root.style.setProperty('--android-textbox-padding', '12px');
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sessionStorage.setItem('androidBackgrounded', 'true');
        root.style.setProperty('--android-textbox-padding', '12px');
      } else if (document.visibilityState === 'visible') {
        // Re-apply on visible in case it was cleared
        if (sessionStorage.getItem('androidBackgrounded') === 'true') {
          root.style.setProperty('--android-textbox-padding', '12px');
        }
      }
    };

    const handleOrientationChange = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      if (isPortrait) {
        sessionStorage.setItem('androidBackgrounded', 'true');
        root.style.setProperty('--android-textbox-padding', '12px');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  // Check for notification permission when app loads
  // This needs to be called from a user interaction (e.g., button click)
  // but we can check if it's already been granted
  useEffect(() => {
    // Check if the browser supports notifications
    if ('Notification' in window) {
      console.log("Notification permission:", Notification.permission);

      // We'll let the notification code request permission when a notification
      // arrives rather than asking immediately on app load
      if (Notification.permission === 'granted') {
        console.log("Notification permission already granted");
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AchievementsProvider>
            <MainContent />
            <AchievementsContainer />
            <Toaster />
          </AchievementsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;