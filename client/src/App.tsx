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
import HomePage from "@/pages/home-page";
import ActivityPage from "@/pages/activity-page";
import ActivityManagementPage from "@/pages/activity-management";
import HelpPage from "@/pages/help-page";
import NotificationsPage from "@/pages/notifications-page";
import ProfilePage from "@/pages/profile-page";
import AdminPage from "@/pages/admin-page";
import MenuPage from "@/pages/menu-page";
import { BottomNav } from "@/components/bottom-nav";
import { VerticalNav } from "@/components/vertical-nav";
import NotificationSettingsPage from "@/pages/notification-settings-page"; // Import the notification settings page
import NotificationSchedulePage from "@/pages/notification-schedule-page"; // Keep for backward compatibility
import { LeaderboardPage } from "@/pages/leaderboard-page"; // Import the leaderboard page
import { DebugApi } from "./debug-api"; // Import our debug component
import { AchievementsContainer } from "@/components/achievements/achievements-container";
import PrayerRequestsPage from "@/pages/prayer-requests-page"; // Import the prayer requests page
import DocumentUploadTest from "@/components/ui/document-upload-test"; // Import document upload test


// Separate auth-dependent rendering
function MainContent() {
  const { user, isLoading, error } = useAuth();
  console.log('MainContent rendering - auth state:', { user, isLoading, error });

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

  // Special case for document test page - accessible regardless of auth
  if (!user && window.location.pathname === '/doc-test') {
    return (
      <div className="min-h-screen">
        <DocumentUploadTest />
      </div>
    );
  }
  
  // If not authenticated, show auth page
  if (!user) {
    return <AuthPage />;
  }

  // If authenticated, show the app with routes
  return (
    <div className="min-h-screen">
      {user && <div className="fixed left-0 top-0 z-[51]"><VerticalNav /></div>}
      <div className="md:pl-20" style={{overflowX: 'hidden'}}> {/* Adjusted padding to match new nav width */}
        <Switch>
          <Route path="/" component={HomePage} />
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
          <Route path="/doc-test" component={() => <DocumentUploadTest />} />
          {user.isAdmin && <Route path="/admin" component={() => <AdminPage />} />}
          <Route path="*">Not found</Route>
        </Switch>
      </div>
      <BottomNav />
    </div>
  );
}

function App() {
  console.log('App component rendering');
  
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