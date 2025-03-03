import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";

// Separate the main content to isolate auth-dependent rendering
function MainContent() {
  const { user, isLoading, error } = useAuth();
  console.log('MainContent rendering with auth state:', { user, isLoading, error });

  if (error) {
    console.error('Auth error:', error);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500">Authentication Error</h1>
          <p className="mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Team Fitness Tracker</h1>
          <p className="mt-2">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Show AuthPage if not authenticated
  if (!user) {
    return <AuthPage />;
  }

  // Show HomePage if authenticated
  return <HomePage />;
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