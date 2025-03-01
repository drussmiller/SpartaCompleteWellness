import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Route, Redirect } from "wouter";

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <Route path={path}>
      {() => {
        console.log('Protected route evaluation:', {
          path,
          isAuthenticated: !!user,
          userId: user?.id,
          username: user?.username
        });

        if (!user) {
          console.log('Access denied - redirecting to /auth');
          return <Redirect to="/auth" />;
        }

        console.log('Access granted to protected route:', path);
        return <Component />;
      }}
    </Route>
  );
}