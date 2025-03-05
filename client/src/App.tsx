import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import { ProtectedRoute } from "./lib/protected-route";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ActivityPage from "@/pages/activity-page";
import ActivityManagementPage from "@/pages/activity-management";
import HelpPage from "@/pages/help-page";
import NotificationsPage from "@/pages/notifications-page";
import ProfilePage from "@/pages/profile-page";
import AdminPage from "@/pages/admin-page";
import { BottomNav } from "@/components/bottom-nav";

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

  // If not authenticated, show auth page
  if (!user) {
    return <AuthPage />;
  }

  // If authenticated, show the app with routes
  return (
    <div className="min-h-screen">
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/activity" component={ActivityPage} />
        <Route path="/activity-management" component={ActivityManagementPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/profile" component={ProfilePage} />
        {user.isAdmin && <Route path="/admin" component={AdminPage} />}
        <Route component={() => <div className="p-4">Page not found</div>} />
      </Switch>
      <BottomNav />
    </div>
  );
}

function App() {
  console.log('App component rendering');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MainContent />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;