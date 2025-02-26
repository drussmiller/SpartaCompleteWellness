import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Allow admin access to all pages
  if (user.isAdmin) {
    return (
      <Route path={path}>
        <Component />
      </Route>
    );
  }

  // For non-admin users without a team, only allow access to profile and help pages
  if (!user.teamId && !path.match(/^\/(profile|help)$/)) {
    return (
      <Route path={path}>
        <Redirect to="/profile" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      <Component />
    </Route>
  );
}