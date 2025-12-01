import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2, Filter, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useRef, useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSlideCard } from "@/components/messaging/message-slide-card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { usePrayerRequests } from "@/hooks/use-prayer-requests";
import { useRestoreScroll } from "@/hooks/use-restore-scroll";
import { useScrollDirection } from "@/hooks/use-scroll-direction";

const MOBILE_BREAKPOINT = 768;


export default function HomePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const loadingRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const [_, navigate] = useLocation();
  const [showIntroVideosOnly, setShowIntroVideosOnly] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Use scroll direction hook for header/nav animations
  const { isHeaderVisible, isBottomNavVisible, scrollY } = useScrollDirection({
    scrollContainerRef,
    threshold: 50,
    velocityThreshold: 1.5
  });
  
  // Pull-to-refresh state
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullThreshold = 80; // Pull distance needed to trigger refresh
  
  // Restore scroll position when returning from video player
  useRestoreScroll(scrollContainerRef);
  
  // ONE-TIME: Clear stale posts cache to force refetch with thumbnailUrl field
  useEffect(() => {
    const cacheCleared = localStorage.getItem("postsv2CacheCleared");
    if (!cacheCleared) {
      console.log("[CACHE CLEAR] Removing posts cache to force refetch with thumbnailUrl field");
      queryClient.removeQueries({ queryKey: ["/api/posts"] });
      localStorage.setItem("postsv2CacheCleared", "true");
    }
  }, []);

  // Only refetch post limits when needed
  useEffect(() => {
    if (user) {
      const lastRefetchTime = localStorage.getItem("lastPostLimitsRefetch");
      const now = Date.now();
      if (!lastRefetchTime || now - parseInt(lastRefetchTime) > 1800000) {
        refetchLimits();
        localStorage.setItem("lastPostLimitsRefetch", now.toString());
      }
    }
  }, [user, refetchLimits]);

  const {
    data: posts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/posts", "v2", user?.teamId, user?.id, showIntroVideosOnly], // v2: includes thumbnailUrl field
    queryFn: async () => {
      // Admin/Group Admin filter for introductory videos from team-less users
      if (showIntroVideosOnly && (user?.isAdmin || user?.isGroupAdmin)) {
        console.log("Fetching introductory videos from team-less users");
        const response = await apiRequest(
          "GET",
          `/api/posts?teamlessIntroOnly=true`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch posts: ${response.status}`);
        }
        const data = await response.json();
        console.log("Introductory videos from team-less users:", data.length);
        return data;
      }

      // If user is not in a team, fetch only their own introductory video posts
      if (!user?.teamId) {
        console.log("User not in team, fetching only their introductory video");
        const response = await apiRequest(
          "GET",
          `/api/posts?type=introductory_video&userId=${user?.id}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch posts: ${response.status}`);
        }
        const data = await response.json();
        console.log("Introductory video posts for team-less user:", data.length);
        return data;
      }

      // Make sure to exclude prayer posts from Team page
      console.log("Fetching posts...");
      const response = await apiRequest(
        "GET",
        `/api/posts?page=1&limit=50&exclude=prayer&teamOnly=true`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
      }
      const data = await response.json();

      console.log("Posts received from API:", data.length, "posts");

      // Double-check to filter out any prayer posts that might have slipped through
      const filtered = data.filter((post) => post.type !== "prayer");
      console.log("Posts after prayer filtering:", filtered.length);

      return filtered;
    },
    enabled: !!user,
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    staleTime: 0, // TEMPORARY: Force fresh fetch to get thumbnailUrl field
  });

  // Import usePrayerRequests hook to mark prayer requests as viewed
  const { markAsViewed, unreadCount: prayerRequestCount } = usePrayerRequests();

  const handlePrayerRequestsClick = () => {
    // Mark prayer requests as viewed before navigating
    markAsViewed();
    navigate("/prayer-requests");
  };

  // Pull-to-refresh handlers - use container scrollTop instead of window.scrollY
  const handleTouchStart = (e: React.TouchEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    // Only start pull if at the top of the container
    if (scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    if (scrollTop > 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY;
    
    // Only track pull down (positive distance)
    if (distance > 0) {
      // Apply resistance to make pull feel natural (diminishing returns)
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    
    setIsPulling(false);
    
    // Trigger refresh if pulled past threshold
    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await refetch();
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 500);
      }
    } else {
      setPullDistance(0);
    }
  };

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error loading posts</h2>
            <p>{error instanceof Error ? error.message : "Unknown error"}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      isBottomNavVisible={isBottomNavVisible}
      scrollContainerRef={scrollContainerRef}
    >
      <div className="min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div
          className="fixed top-0 left-0 right-0 z-[50] bg-background"
          style={{
            transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
            transition: "transform 0.3s ease-out",
            pointerEvents: "auto",
          }}
        >
          <div className={`w-full mx-auto ${!isMobile ? 'max-w-[1000px] px-4 md:px-40 md:pl-64' : 'px-4'}`}>
            <div className={`${!isMobile ? 'border-b border-border' : ''}`}>
              <div className="flex items-center justify-between pt-12">
                <div className="flex-1 flex justify-center">
                  <img
                    src="/sparta_circle_red.png"
                    alt="Sparta Complete Wellness Logo"
                    className="w-36 h-auto mx-auto"
                    onError={(e) => {
                      console.error("Error loading logo:", e);
                      // Fallback to a different logo if the main one fails
                      e.currentTarget.src = "/Spartans_LOGO.png";
                    }}
                  />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <CreatePostDialog remaining={remaining} initialType="food" />
                    {user?.teamId && <MessageSlideCard />}
                  </div>
                  {/* Admin/Group Admin filter for introductory videos */}
                  {(user?.isAdmin || user?.isGroupAdmin) && (
                    <Button
                      variant={showIntroVideosOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowIntroVideosOnly(!showIntroVideosOnly)}
                      className="text-xs h-7"
                      data-testid="button-filter-intro-videos"
                    >
                      <Filter className="h-3 w-3 mr-1" />
                      {showIntroVideosOnly ? "Show All Posts" : "New Users"}
                    </Button>
                  )}
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
                  className={`flex-1 ml-2 h-10 text-sm font-medium ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!user?.teamId}
                  onClick={handlePrayerRequestsClick}
                >
                  <div className="relative">
                    Prayer Requests
                    {user?.teamId && prayerRequestCount > 0 && (
                      <div className="absolute -top-2 -right-8 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {prayerRequestCount > 99 ? "99+" : prayerRequestCount}
                      </div>
                    )}
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main content layout */}
        <div
          className={`${!isMobile ? "max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56 pt-32" : "w-full"}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Pull-to-refresh indicator */}
          <div 
            className="fixed top-0 left-0 right-0 flex justify-center items-center z-40 pointer-events-none"
            style={{
              transform: `translateY(${Math.min(pullDistance - 20, 60)}px)`,
              opacity: pullDistance > 20 ? Math.min(pullDistance / pullThreshold, 1) : 0,
              transition: isPulling ? 'none' : 'all 0.3s ease-out',
            }}
          >
            <div className="bg-background rounded-full p-3 shadow-lg border border-border">
              <RefreshCw 
                className={`h-5 w-5 text-primary ${isRefreshing || pullDistance >= pullThreshold ? 'animate-spin' : ''}`}
                data-testid="icon-refresh"
              />
            </div>
          </div>

          <main className={`p-4 ${!isMobile ? 'border-x border-border' : ''}`}>
            {/* Header */}
            <div className="mb-6">
              <div style={{ height: "75px" }}></div>
            </div>

              <div className="space-y-2">
                {posts?.length > 0 ? (
                  posts.map((post: Post, index: number) => (
                    <div key={post.id}>
                      <ErrorBoundary>
                        <PostCard post={post} />
                      </ErrorBoundary>
                      {index < posts.length - 1 && (
                        <div className="h-[6px] bg-border my-2 -mx-4" />
                      )}
                    </div>
                  ))
                ) : !isLoading ? (
                  <div className="text-center text-muted-foreground py-8">
                    {!user?.teamId ? (
                      <div>
                        <p className="text-lg font-medium mb-2">Welcome to Sparta Complete Wellness!</p>
                        <p className="text-sm">Post your introductory video to let others get to know you.</p>
                        <p className="text-sm mt-2">Once you join a team, your video will appear on the team page!</p>
                      </div>
                    ) : (
                      "No posts yet. Be the first to share!"
                    )}
                  </div>
                ) : null}

                {/* Loading indicator */}
                <div ref={loadingRef} className="flex justify-center py-4">
                  {isLoading && <Loader2 className="h-8 w-8 animate-spin" />}
                </div>
              </div>
            </main>
        </div>
      </div>
    </AppLayout>
  );
}
