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
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { usePrayerRequests } from "@/hooks/use-prayer-requests";

const MOBILE_BREAKPOINT = 768;

const mobileScrollStyles = {
  minHeight: '100vh',
  WebkitOverflowScrolling: 'touch',
  scrollBehavior: 'smooth',
  overscrollBehavior: 'auto',
  touchAction: 'pan-y pinch-zoom',
  WebkitTapHighlightColor: 'transparent',
  paddingBottom: '60px',
  position: 'relative',
  overflowX: 'hidden',
  WebkitTransform: 'translate3d(0,0,0)',
  WebkitBackfaceVisibility: 'hidden',
  WebkitPerspective: '1000',
} as const;

export default function HomePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const loadingRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const [_, navigate] = useLocation();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const lastScrollY = useRef(0);

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

  const { data: posts = [], isLoading, error } = useQuery({
    queryKey: ["/api/posts", "team-posts"],
    queryFn: async () => {
      // Make sure to exclude prayer posts from Team page
      console.log("Fetching posts...");
      const response = await apiRequest("GET", `/api/posts?page=1&limit=50&exclude=prayer`);
      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
      }
      const data = await response.json();

      console.log("Posts received from API:", data.length, "posts");

      // Double-check to filter out any prayer posts that might have slipped through
      const filtered = data.filter(post => post.type !== 'prayer');
      console.log("Posts after prayer filtering:", filtered.length);

      return filtered;
    },
    enabled: !!user,
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    staleTime: 1000 * 60 * 2, // Consider data stale after 2 minutes
  });

  // Import usePrayerRequests hook to mark prayer requests as viewed
  const { markAsViewed, unreadCount: prayerRequestCount } = usePrayerRequests();

  const handlePrayerRequestsClick = () => {
    // Mark prayer requests as viewed before navigating
    markAsViewed();
    navigate('/prayer-requests');
  };

  // Handle scroll for moving navigation panels
  useEffect(() => {
    let scrollVelocity = 0;
    let lastScrollTime = Date.now();

    const handleScroll = (event) => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastScrollTime;

      // Calculate scroll velocity (pixels per millisecond)
      if (timeDelta > 0) {
        scrollVelocity = Math.abs(currentScrollY - lastScrollY.current) / timeDelta;
      }

      console.log('🟢 Home - Scroll detected - scrollY:', currentScrollY, 'last:', lastScrollY.current, 'velocity:', scrollVelocity.toFixed(3));

      // Move panels down when scrolling down past 50px
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down - move panels off screen
        console.log('🔽 Home - Moving panels down - scrollY:', currentScrollY);
        setScrollOffset(currentScrollY);
        setIsHeaderVisible(true);
        setIsBottomNavVisible(true);
      } 
      // Move panels back when at top OR when scrolling up fast (velocity > 1.5 pixels/ms) from anywhere
      else if (currentScrollY <= 50 || (currentScrollY < lastScrollY.current && scrollVelocity > 1.5)) {
        // Near top OR scrolling up fast from anywhere - bring panels back
        const reason = currentScrollY <= 50 ? 'near top' : `fast scroll up (velocity: ${scrollVelocity.toFixed(3)})`;
        console.log('🔼 Home - Bringing panels back -', reason, '- scrollY:', currentScrollY);

        // Reset scroll offset to 0 when scrolling up fast from anywhere
        setScrollOffset(0);
        setIsHeaderVisible(true);
        setIsBottomNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
      lastScrollTime = currentTime;
    };

    // Add scroll listeners to multiple potential scroll containers
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    // Also try listening on the main content area
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Also try the root div
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Initial check
    console.log('📝 Initial scroll setup - scrollY:', window.scrollY);
    console.log('📝 Document height:', document.documentElement.scrollHeight);
    console.log('📝 Window height:', window.innerHeight);
    console.log('📝 Body scroll height:', document.body.scrollHeight);
    console.log('📝 Main element found:', !!mainElement);
    console.log('📝 Root element found:', !!rootElement);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
      document.body.removeEventListener('scroll', handleScroll);
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
      if (rootElement) {
        rootElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error loading posts</h2>
            <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout isBottomNavVisible={isBottomNavVisible} scrollOffset={scrollOffset}>
      <div className="min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div 
          className="fixed top-0 left-0 right-0 z-[50] bg-background border-b border-border"
          style={{
            transform: `translateY(-${scrollOffset}px)`,
            transition: 'transform 1.5s ease-out',
            pointerEvents: 'auto'
          }}
        >
          <div className="w-full max-w-[1000px] mx-auto px-4 md:pl-24">
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
                <CreatePostDialog remaining={remaining} initialType="food" />
                <MessageSlideCard />
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-1 mb-2 px-6">
              <Button 
                variant="default" 
                className="flex-1 mr-2 bg-violet-700 text-white hover:bg-violet-800 h-10 text-sm font-medium"
              >
                Team
              </Button>
              <Button 
                variant="outline"
                className="flex-1 ml-2 h-10 text-sm font-medium"
                onClick={handlePrayerRequestsClick}
              >
                <div className="relative">
                  Prayer Requests
                  {prayerRequestCount > 0 && (
                    <div className="absolute -top-2 -right-8 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {prayerRequestCount > 99 ? '99+' : prayerRequestCount}
                    </div>
                  )}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Main content layout */}
        <div className="w-full">
          <div className={`${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:pl-24 md:pr-12' : 'w-full'}`}>
            <main className="p-4">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">Welcome to Sparta</h1>
                <p className="text-muted-foreground">
                  Share your journey and stay motivated with the community
                </p>
              </div>

                <div className="space-y-2">
                  {posts?.length > 0 ? (
                    posts.map((post: Post, index: number) => (
                      <div key={post.id}>
                        <ErrorBoundary>
                          <PostCard post={post} />
                        </ErrorBoundary>
                        {index < posts.length - 1 && <div className="h-[6px] bg-border my-2 -mx-4" />}
                      </div>
                    ))
                  ) : !isLoading ? (
                    <div className="text-center text-muted-foreground py-8">
                      No posts yet. Be the first to share!
                      <div className="mt-8 space-y-4">
                        {/* Add content to test scrolling behavior */}
                        {Array.from({ length: 20 }, (_, i) => (
                          <div key={i} className="h-40 bg-gray-100 rounded flex items-center justify-center text-gray-600 text-lg font-bold">
                            Test Content Block {i + 1} - Scroll Position: {scrollOffset}px
                          </div>
                        ))}
                      </div>
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