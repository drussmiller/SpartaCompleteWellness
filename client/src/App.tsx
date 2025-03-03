import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "@/components/error-boundary";

function App() {
  console.log('App component rendering');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="p-4">
          <h1 className="text-2xl font-bold">Team Fitness Tracker</h1>
          <p className="mt-2">Loading application...</p>
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;