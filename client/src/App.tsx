import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";

// Simplified component to verify React rendering
function MainContent() {
  console.log('MainContent rendering - basic test');
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Team Fitness Tracker</h1>
        <p className="mt-2">Initial render test</p>
      </div>
    </div>
  );
}

function App() {
  console.log('App component rendering');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MainContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;