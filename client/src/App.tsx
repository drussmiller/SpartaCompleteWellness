
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import ProfilePage from "@/pages/profile-page";
import AdminPage from "@/pages/admin-page";
import NotificationsPage from "@/pages/notifications-page";
import HelpPage from "@/pages/help-page";
import LibraryPage from "@/pages/library-page";
import ActivityPage from "@/pages/activity-page";
import ActivityManagementPage from "@/pages/activity-management";
import CommentsPage from "@/pages/comments-page";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Switch>
          <Route path="/auth" component={AuthPage} />
          <ProtectedRoute path="/" component={HomePage} />
          <ProtectedRoute path="/profile" component={ProfilePage} />
          <ProtectedRoute path="/admin" component={AdminPage} />
          <ProtectedRoute path="/notifications" component={NotificationsPage} />
          <ProtectedRoute path="/help" component={HelpPage} />
          <ProtectedRoute path="/library" component={LibraryPage} />
          <ProtectedRoute path="/activity" component={ActivityPage} />
          <ProtectedRoute path="/activity-management" component={ActivityManagementPage} />
          <ProtectedRoute path="/comments/:id" component={CommentsPage} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
