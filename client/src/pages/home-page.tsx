import { useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2, Filter } from "lucide-react";
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
import { useRestoreScroll } from "@/hooks/use-restore-scroll";

const MOBILE_BREAKPOINT = 768;

const mobileScrollStyles = {
  minHeight: "100vh",
  WebkitOverflowScrolling: "touch",
  scrollBehavior: "auto",
  overscrollBehavior: "auto",
  touchAction: "pan-y pinch-zoom",
  WebkitTapHighlightColor: "transparent",
  paddingBottom: "60px",
  position: "relative",
  overflowX: "hidden",
  WebkitTransform: "translate3d(0,0,0)",
  WebkitBackfaceVisibility: "hidden",
  WebkitPerspective: "1000",
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
  const [showIntroVideosOnly, setShowIntroVideosOnly] = useState(false);
  
  // Restore scroll position when returning from video player
  useRestoreScroll();

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
  } = useQuery({
    queryKey: ["/api/posts", "team-posts", user?.teamId, user?.id, showIntroVideosOnly],
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
    staleTime: 1000 * 60 * 2, // Consider data stale after 2 minutes
  });

  // Import usePrayerRequests hook to mark prayer requests as viewed
  const { markAsViewed, unreadCount: prayerRequestCount } = usePrayerRequests();

  const handlePrayerRequestsClick = () => {
    // Mark prayer requests as viewed before navigating
    markAsViewed();
    navigate("/prayer-requests");
  };

  // Handle scroll for moving navigation panels
  useEffect(() => {
    let scrollVelocity = 0;
    let lastScrollTime = Date.now();

    const handleScroll = (event) => {
      const currentScrollY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const currentTime = Date.now();
      const timeDelta = currentTime - lastScrollTime;

      // Calculate scroll velocity (pixels per millisecond)
      if (timeDelta > 0) {
        scrollVelocity =
          Math.abs(currentScrollY - lastScrollY.current) / timeDelta;
      }

      console.log(
        "🟢 Home - Scroll detected - scrollY:",
        currentScrollY,
        "last:",
        lastScrollY.current,
        "velocity:",
        scrollVelocity.toFixed(3),
      );

      // Hide panels when scrolling down past 50px
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling down - hide both panels
        console.log("🔽 Home - Hiding panels - scrollY:", currentScrollY);
        setIsHeaderVisible(false);
        setIsBottomNavVisible(false);
      }
      // Show panels when at top OR when scrolling up fast (velocity > 1.5 pixels/ms) from anywhere
      else if (
        currentScrollY <= 50 ||
        (currentScrollY < lastScrollY.current && scrollVelocity > 1.5)
      ) {
        // Near top OR scrolling up fast from anywhere - show both panels
        const reason =
          currentScrollY <= 50
            ? "near top"
            : `fast scroll up (velocity: ${scrollVelocity.toFixed(3)})`;
        console.log(
          "🔼 Home - Showing panels -",
          reason,
          "- scrollY:",
          currentScrollY,
        );
        setIsHeaderVisible(true);
        setIsBottomNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
      lastScrollTime = currentTime;
    };

    // Add scroll listeners to multiple potential scroll containers
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });
    document.body.addEventListener("scroll", handleScroll, { passive: true });

    // Also try listening on the main content area
    const mainElement = document.querySelector("main");
    if (mainElement) {
      mainElement.addEventListener("scroll", handleScroll, { passive: true });
    }

    // Also try the root div
    const rootElement = document.getElementById("root");
    if (rootElement) {
      rootElement.addEventListener("scroll", handleScroll, { passive: true });
    }

    // Initial check
    console.log("📝 Initial scroll setup - scrollY:", window.scrollY);
    console.log("📝 Document height:", document.documentElement.scrollHeight);
    console.log("📝 Window height:", window.innerHeight);
    console.log("📝 Body scroll height:", document.body.scrollHeight);
    console.log("📝 Main element found:", !!mainElement);
    console.log("📝 Root element found:", !!rootElement);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
      document.body.removeEventListener("scroll", handleScroll);
      if (mainElement) {
        mainElement.removeEventListener("scroll", handleScroll);
      }
      if (rootElement) {
        rootElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

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
    <AppLayout isBottomNavVisible={isBottomNavVisible}>
      <div className="min-h-screen bg-background">
        {/* Fixed Header - spans full width */}
        <div
          className="fixed top-0 left-0 right-0 z-[50] bg-background border-b border-border"
          style={{
            transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
            transition: "transform 0.3s ease-out",
            pointerEvents: "auto",
          }}
        >
          <div className="w-full max-w-[1000px] mx-auto px-4 md:px-40 md:pl-64">
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
                  {!user?.teamId && <span className="ml-1 text-xs text-muted-foreground">(Team Required)</span>}
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

        {/* Main content layout */}
        <div
          className={`${!isMobile ? "max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56 pt-32" : "w-full"}`}
        >
          <main className="p-4" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
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
