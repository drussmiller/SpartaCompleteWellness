import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSlideCard } from "@/components/messaging/message-slide-card";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrayerRequestsPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { remaining, refetch: refetchLimits } = usePostLimits();
  const loadingRef = useRef<HTMLDivElement>(null);
  const [_, navigate] = useLocation();

  // Only refetch post limits when needed
  useEffect(() => {
    if (user) {
      const lastRefetchTime = localStorage.getItem('lastPostLimitsRefetch');
      const now = Date.now();
      if (!lastRefetchTime || now - parseInt(lastRefetchTime) > 1800000) {
        refetchLimits();
        localStorage.setItem('lastPostLimitsRefetch', now.toString());
      }
    }
  }, [user, refetchLimits]);

  const { data: prayerRequests = [], isLoading, error } = useQuery({
    queryKey: ["/api/posts/prayer-requests"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/posts?type=prayer&page=1&limit=50`);
      if (!response.ok) {
        throw new Error(`Failed to fetch prayer requests: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // Consider data stale after 1 minute
  });

  const handleTeamClick = () => {
    navigate('/');
  };

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error loading prayer requests</h2>
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
          <div className="w-full max-w-[768px] mx-auto px-4">
            <div className="flex items-center justify-between pt-12">
              <div className="flex-1 flex justify-center">
                <img
                  src="/sparta_circle_red.png"
                  alt="Sparta Complete Wellness Logo"
                  className="w-48 h-auto mx-auto"
                  onError={(e) => {
                    console.error('Error loading logo:', e);
                    e.currentTarget.src = '/fallback-logo.png';
                  }}
                />
              </div>
              <div className="flex items-center">
                <CreatePostDialog remaining={remaining} initialType="prayer" />
                <MessageSlideCard />
              </div>
            </div>
            
            {/* Navigation Buttons */}
            <div className="flex justify-between mt-1 mb-2 px-6">
              <Button 
                variant="outline" 
                onClick={handleTeamClick}
                className="flex-1 mr-2 h-10 text-sm font-medium"
              >
                Team
              </Button>
              <Button 
                variant="default"
                className="flex-1 ml-2 bg-primary text-primary-foreground h-10 text-sm font-medium"
              >
                Prayer Requests
              </Button>
            </div>
          </div>
        </div>

        {/* Three column layout for non-mobile */}
        <div className="w-full">
          <div className="flex justify-between">
            {/* Left panel - hidden on mobile */}
            {!isMobile && (
              <div className="w-1/4 min-h-screen border-r border-border p-4 bg-background">
                <h2 className="text-lg font-semibold mb-4">Left Panel</h2>
                <img
                  src="/sparta_circle_red.png"
                  alt="Sparta Logo"
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            {/* Main content */}
            <div className={`${isMobile ? 'w-full' : 'w-2/4'} px-4`}>
              <main className="mt-28 mb-20"> {/* Adjusted for the smaller nav buttons and closer positioning */}
                <div className="space-y-2">
                  {prayerRequests?.length > 0 ? (
                    prayerRequests.map((post: Post, index: number) => (
                      <div key={post.id}>
                        <ErrorBoundary>
                          <PostCard post={post} />
                        </ErrorBoundary>
                        {index < prayerRequests.length - 1 && <div className="h-[6px] bg-border my-2 -mx-4" />}
                      </div>
                    ))
                  ) : !isLoading ? (
                    <div className="text-center text-muted-foreground py-8">
                      No prayer requests yet. Share one to get started!
                    </div>
                  ) : null}

                  {/* Loading indicator */}
                  <div ref={loadingRef} className="flex justify-center py-4">
                    {isLoading && (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    )}
                  </div>
                </div>
              </main>
            </div>

            {/* Right panel - hidden on mobile */}
            {!isMobile && (
              <div className="w-1/4 min-h-screen border-l border-border p-4 bg-background">
                <h2 className="text-lg font-semibold mb-4">Right Panel</h2>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}