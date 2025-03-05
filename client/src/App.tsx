import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";

// Import the NotFound component for the fallback route
import NotFound from "@/pages/not-found";
import { Route, Switch } from "wouter";

function App() {
  console.log("App component rendering");

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  console.log("AppContent rendering");

  return (
    <div className="min-h-screen p-4 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">App is working!</h1>
        <p>If you see this message, the React application is rendering correctly.</p>
      </div>
    </div>
  );
}

export default App;