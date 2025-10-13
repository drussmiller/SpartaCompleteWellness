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
import { useRef, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSlideCard } from "@/components/messaging/message-slide-card";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePrayerRequests } from "@/hooks/use-prayer-requests";
import { useRestoreScroll } from "@/hooks/use-restore-scroll";

export default function PrayerRequestsPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { remaining, refetch: refetchLimits } = usePostLimits();
  const { markAsViewed } = usePrayerRequests();
  const loadingRef = useRef<HTMLDivElement>(null);
  const [_, navigate] = useLocation();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  
  // Restore scroll position when returning from video player
  useRestoreScroll();

  // Mark prayer requests as viewed when page loads
  useEffect(() => {
    if (user) {
      console.log("Prayer Requests Page: Marking prayer requests as viewed");
      markAsViewed();
    }
  }, [user, markAsViewed]);

  // Handle scroll for hiding/showing navigation
  useEffect(() => {
    let scrollVelocity = 0;
    let lastScrollTime = Date.now();

    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastScrollTime;

      // Calculate scroll velocity (pixels per millisecond)
      if (timeDelta > 0) {
        scrollVelocity = Math.abs(currentScrollY - lastScrollY.current) / timeDelta;
      }

      console.log('Prayer Requests - Scroll detected - scrollY:', currentScrollY, 'last:', lastScrollY.current, 'velocity:', scrollVelocity.toFixed(3));

      // Hide header when scrolling down past 50px
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down - hide header and bottom nav
        console.log('Prayer Requests - Hiding header and bottom nav - scrollY:', currentScrollY, 'setting isBottomNavVisible to false');
        setIsHeaderVisible(false);
        setIsBottomNavVisible(false);
      } 
      // Show header/nav when at top OR when scrolling up fast (velocity > 1.5 pixels/ms)
      else if (currentScrollY <= 50 || (currentScrollY < lastScrollY.current && scrollVelocity > 1.5)) {
        // Near top OR scrolling up fast - show header and bottom nav
        const reason = currentScrollY <= 50 ? 'near top' : `fast scroll up (velocity: ${scrollVelocity.toFixed(3)})`;
        console.log(`Prayer Requests - Showing header and bottom nav - ${reason} - scrollY:`, currentScrollY, 'setting isBottomNavVisible to true');
        setIsHeaderVisible(true);
        setIsBottomNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
      lastScrollTime = currentTime;
    };

    // Add scroll event listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    // Also try listening on the main content area
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
      document.body.removeEventListener('scroll', handleScroll);
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

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

  const { data: prayerRequests = [], isLoading, error, refetch, isSuccess } = useQuery({
    queryKey: ["/api/posts", { type: "prayer", page: 1, limit: 50 }],
    queryFn: async () => {
      try {
        console.log('Fetching prayer requests...');
        const response = await apiRequest("GET", `/api/posts?type=prayer&page=1&limit=50`);
        console.log('Prayer requests response status:', response.status);
        
        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}`;
          try {
            const errorText = await response.text();
            if (errorText) errorMessage += `: ${errorText}`;
          } catch {
            // Ignore errors reading response body
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('Prayer requests fetched successfully:', data.length, 'posts');
        return data;
      } catch (err) {
        console.error('Prayer requests fetch error:', err);
        throw err;
      }
    },
    enabled: !!user,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // Consider data stale after 1 minute
  });

  const handleTeamClick = () => {
    navigate('/');
  };

  // Only show error if loading failed and we have no data
  if (error && !isLoading && prayerRequests.length === 0) {
    console.error('Rendering error state:', error);
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center p-4 max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-2 text-destructive">Error loading prayer requests</h2>
            <p className="text-muted-foreground mb-4">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => refetch()}>Try Again</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>Reload Page</Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  console.log('Prayer Requests Page State:', { 
    isLoading, 
    error: error ? error.message : null, 
    isSuccess, 
    prayerRequestsCount: prayerRequests?.length 
  });

  return (
    <AppLayout isBottomNavVisible={isBottomNavVisible}>
      <div className="flex flex-col min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div 
          className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border transition-transform duration-700 ease-in-out"
          style={{
            transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)'
          }}
        >
          <div className="w-full max-w-[1000px] mx-auto px-4">
            <div className="flex items-center justify-between pt-12">
              <div className="flex-1 flex justify-center">
                <img
                  src="/sparta_circle_red.png"
                  alt="Sparta Complete Wellness Logo"
                  className="w-36 h-auto mx-auto"
                  onError={(e) => {
                    console.error('Error loading logo:', e);
                    e.currentTarget.src = '/fallback-logo.png';
                  }}
                />
              </div>
              <div className="flex items-center">
                <CreatePostDialog remaining={remaining} defaultType="prayer" hideTypeField={true} />
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
                className="flex-1 ml-2 bg-violet-700 text-white hover:bg-violet-800 h-10 text-sm font-medium"
              >
                Prayer Requests
              </Button>
            </div>
          </div>
        </div>

        {/* Main content layout */}
        <div className="w-full">
          <div className={`${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56' : 'w-full'}`}>
            <main className="p-4 pt-24">
              {prayerRequests?.length === 0 && (
                <div className="mb-6">
                  <h1 className="text-2xl font-bold mb-2">Prayer Requests</h1>
                  <p className="text-muted-foreground">
                    Share your prayer requests and pray for others
                  </p>
                </div>
              )}

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
        </div>
      </div>
    </AppLayout>
  );
}