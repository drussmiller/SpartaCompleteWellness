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

  // Force immediate logging
  console.log('🏠 HOMEPAGE RENDER - Starting HomePage component');
  window.console.log('🏠 FORCED - HomePage component is rendering');

  // Get posts with React Query
  const {
    data: posts = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      console.log('🔍 POSTS FETCH - Starting posts fetch request');
      window.console.log('🔍 FORCED - Starting posts fetch request');

      const response = await apiRequest("GET", `/api/posts?page=1&limit=50&exclude=prayer`);

      console.log('🔍 POSTS FETCH - Response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });
      window.console.log('🔍 FORCED - Posts fetch response:', response.status, response.statusText);

      if (!response.ok) {
        console.error('🔍 POSTS FETCH - Failed:', response.status, response.statusText);
        window.console.error('🔍 FORCED - Posts fetch failed:', response.status);
        throw new Error('Failed to fetch posts');
      }

      const data = await response.json();
      console.log('🔍 POSTS FETCH - Data received:', {
        isArray: Array.isArray(data),
        length: Array.isArray(data) ? data.length : 'not array',
        firstPost: Array.isArray(data) && data.length > 0 ? data[0] : 'no posts'
      });
      window.console.log('🔍 FORCED - Posts data:', Array.isArray(data) ? `${data.length} posts` : 'not array');

      // Check for video posts specifically
      const videoPosts = data.filter(post => 
        post.image_url && post.image_url.toLowerCase().includes('.mov')
      );
      console.log("Video posts found:", videoPosts.length, videoPosts.map(p => ({
        id: p.id,
        type: p.type,
        imageUrl: p.image_url
      })));

      // Check if the specific video post exists
      const targetVideoPost = data.find(post => 
        post.image_url && post.image_url.includes('1750097964520-IMG_7923.MOV')
      );
      console.log("Target video post found:", !!targetVideoPost, targetVideoPost?.id);

      // Double-check to filter out any prayer posts that might have slipped through
      const filtered = data.filter(post => post.type !== 'prayer');
      console.log("Posts after prayer filtering:", filtered.length);

      return filtered;
    },
    enabled: !!user,
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    staleTime: 1000 * 60 * 2, // Consider data stale after 2 minutes
  });

    // Log current state for debugging
  console.log('🏠 HOMEPAGE STATE:', {
    postsCount: posts.length,
    isLoading,
    hasError: !!error,
    currentUser: user?.id,
    postsData: posts
  });

  // Force logging to appear
  window.console.log('🏠 FORCED - HomePage state:', {
    posts: posts.length,
    loading: isLoading,
    error: !!error,
    user: user?.id
  });

  // Import usePrayerRequests hook to mark prayer requests as viewed
  const { markAsViewed, unreadCount: prayerRequestCount } = usePrayerRequests();

  const handlePrayerRequestsClick = () => {
    // Mark prayer requests as viewed before navigating
    markAsViewed();
    navigate('/prayer-requests');
  };

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

      console.log('Scroll detected - scrollY:', currentScrollY, 'last:', lastScrollY.current, 'velocity:', scrollVelocity.toFixed(3));

      // Hide header when scrolling down past 50px
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down - hide header and bottom nav
        console.log('Hiding header and bottom nav - scrollY:', currentScrollY, 'setting isBottomNavVisible to false');
        setIsHeaderVisible(false);
        setIsBottomNavVisible(false);
      } 
      // Show header/nav when at top OR when scrolling up fast (velocity > 1.5 pixels/ms)
      else if (currentScrollY <= 50 || (currentScrollY < lastScrollY.current && scrollVelocity > 1.5)) {
        // Near top OR scrolling up fast - show header and bottom nav
        const reason = currentScrollY <= 50 ? 'near top' : `fast scroll up (velocity: ${scrollVelocity.toFixed(3)})`;
        console.log(`Showing header and bottom nav - ${reason} - scrollY:`, currentScrollY, 'setting isBottomNavVisible to true');
        setIsHeaderVisible(true);
        setIsBottomNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
      lastScrollTime = currentTime;
    };

    // Test scroll immediately to see current state
    console.log('Setting up scroll listener - current scroll:', window.scrollY);

    // Add multiple event listeners to catch scroll events
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
    <AppLayout isBottomNavVisible={isBottomNavVisible}>
      <div className="min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div 
          className="fixed top-0 left-0 right-0 z-[60] bg-background border-b border-border transition-transform duration-700 ease-in-out"
          style={{
            transform: isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)',
            pointerEvents: isHeaderVisible ? 'auto' : 'none'
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
              <main className="pt-40 mb-20 min-h-[200vh]">
                <div className="space-y-2">
                  {(() => {
                    console.log('🎨 POSTS RENDER - About to render posts section');
                    console.log('🎨 POSTS RENDER - Posts array:', posts);
                    console.log('🎨 POSTS RENDER - Posts length:', posts.length);
                    window.console.log('🎨 FORCED - Rendering posts section, count:', posts.length);
                    return null;
                  })()}
                  {posts?.length > 0 ? (
                    posts.map((post: Post, index: number) => {
                      console.log(`🏗️ RENDERING PostCard for post ${post.id}`);
                      window.console.log(`🏗️ FORCED - Rendering PostCard for post ${post.id}`);
                      
                      try {
                        return (
                          <div key={post.id}>
                            <ErrorBoundary>
                              <PostCard post={post} />
                            </ErrorBoundary>
                            {index < posts.length - 1 && <div className="h-[6px] bg-border my-2 -mx-4" />}
                          </div>
                        );
                      } catch (error) {
                        console.error(`🚨 ERROR rendering PostCard ${post.id}:`, error);
                        window.console.error(`🚨 FORCED ERROR - PostCard ${post.id}:`, error);
                        return (
                          <div key={post.id} className="p-4 bg-red-100 text-red-800 rounded">
                            Error rendering post {post.id}: {error instanceof Error ? error.message : 'Unknown error'}
                          </div>
                        );
                      }
                    })
                  ) : !isLoading ? (
                    <div className="text-center text-muted-foreground py-8">
                      No posts yet. Be the first to share!
                      <div className="mt-8 space-y-4">
                        {/* Add content to test scrolling behavior */}
                        {Array.from({ length: 15 }, (_, i) => (
                          <div key={i} className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-600">
                            Test Content Block {i + 1} - Scroll to test header hiding
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