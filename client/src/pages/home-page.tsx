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
  const [translateDistance, setTranslateDistance] = useState(0);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

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
    const maxTranslateDistance = 100; // Maximum distance panels can move
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      
      // Calculate translation - move panels based on scroll
      const newTranslateDistance = Math.min(currentScrollY, maxTranslateDistance);
      
      console.log('🚀 SCROLL EVENT - scrollY:', currentScrollY, 'translateDistance:', newTranslateDistance);
      
      // Always keep panels visible but move them based on scroll
      setIsHeaderVisible(true);
      setIsBottomNavVisible(true);
      setTranslateDistance(newTranslateDistance);
      
      lastScrollY.current = currentScrollY;
    };

    // Simple scroll setup with immediate test
    console.log('📝 Setting up scroll listener');
    
    // Add scroll listener - try both window and document
    const scrollOptions = { passive: true };
    window.addEventListener('scroll', handleScroll, scrollOptions);
    document.addEventListener('scroll', handleScroll, scrollOptions);
    
    // Force an initial call to test
    handleScroll();
    
    // Test scroll detection after a short delay
    setTimeout(() => {
      console.log('🧪 Testing scroll detection...');
      console.log('  - Current scrollY:', window.scrollY);
      console.log('  - Document height:', document.documentElement.scrollHeight);
      console.log('  - Window height:', window.innerHeight);
      console.log('  - Is scrollable:', document.documentElement.scrollHeight > window.innerHeight);
      
      // Force a manual scroll to test
      window.scrollTo(0, 20);
      setTimeout(() => {
        console.log('  - After manual scroll - scrollY:', window.scrollY);
        handleScroll(); // Force handler call
      }, 100);
    }, 500);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
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
    <AppLayout isBottomNavVisible={isBottomNavVisible} scrollOffset={translateDistance}>
      <div className="min-h-screen bg-background">
        {/* Scroll Debug Indicator */}
        <div className="fixed top-0 left-0 z-[70] bg-red-500 text-white px-2 py-1 text-xs">
          Scroll: {Math.round(translateDistance)}px
        </div>

        {/* Fixed Header - spans full width */}
        <div 
          className="fixed top-0 left-0 right-0 z-[60] bg-background border-b border-border transition-transform duration-100 ease-out"
          style={{
            transform: `translateY(-${translateDistance}px)`,
            pointerEvents: 'auto'
          }}
        >
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
              <main className="pt-40 pb-32" style={{ minHeight: '200vh' }}>
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
                    </div>
                  ) : null}
                  
                  {/* Always add test content to ensure scrollability */}
                  <div className="mt-8 space-y-4">
                    {Array.from({ length: 50 }, (_, i) => (
                      <div key={`scroll-test-${i}`} className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-600 border">
                        <div className="text-center">
                          <div className="font-bold">Scroll Test Block {i + 1}</div>
                          <div className="text-sm">Current scroll offset: {Math.round(translateDistance)}px</div>
                          <div className="text-xs">Window scrollY: {Math.round(lastScrollY.current)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

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