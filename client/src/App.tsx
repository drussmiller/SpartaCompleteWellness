import { Router, Route } from "wouter";
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
import NotificationsPage from "./pages/notifications-page";
import HelpPage from "@/pages/help-page";
import LibraryPage from "@/pages/library-page";
import ActivityPage from "@/pages/activity-page";
import ActivityManagementPage from "@/pages/activity-management";
import CommentsPage from "@/pages/comments-page";
import UsersPage from "@/pages/users-page";

function AppRoutes() {
  return (
    <Router>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/admin" component={AdminPage} />
      <ProtectedRoute path="/notifications" component={NotificationsPage} />
      <ProtectedRoute path="/help" component={HelpPage} />
      <ProtectedRoute path="/library" component={LibraryPage} />
      <ProtectedRoute path="/activity" component={ActivityPage} />
      <ProtectedRoute path="/activity-management" component={ActivityManagementPage} />
      <ProtectedRoute path="/comments/:postId" component={CommentsPage} />
      <ProtectedRoute path="/users" component={UsersPage} />
      <Route path="*" component={NotFound} />
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;