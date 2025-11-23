import { useLocation } from "wouter";
import { Home, Calendar, Bell, Menu, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useMemo, useState } from "react";

interface BottomNavProps {
  orientation?: "horizontal" | "vertical";
  isVisible?: boolean;
  scrollOffset?: number;
}

export function BottomNav({ orientation = "horizontal", isVisible = true, scrollOffset = 0 }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  
  // State to force re-render when waking from sleep/screen saver
  const [, setWakeCounter] = useState(0);

  // Detect Android device - apply padding for Android to keep buttons in safe zone
  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('android');
  }, []);

  // Android-specific: Add bottom padding to keep buttons in safe zone
  const androidPadding = 'calc(env(safe-area-inset-bottom, 16px) + 32px)';

  // Add debug logging to verify props
  console.log('BottomNav render - isVisible:', isVisible, 'isAndroid:', isAndroid, 'androidPadding:', androidPadding);

  // Query for unread notifications count
  const { data: unreadCount = 0, refetch: refetchNotificationCount } = useQuery({
    queryKey: ["/api/notifications/unread"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/notifications/unread");
        if (!response.ok) throw new Error("Failed to fetch notifications");
        const data = await response.json();
        return data.unreadCount || 0;
      } catch (error) {
        console.error("Error fetching notification count:", error);
        return 0;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
    enabled: !!user
  });

  // Refresh notification count and force re-render when page becomes visible or window gains focus
  // This ensures Android padding is properly applied after waking from sleep/screen saver
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Bottom nav: Page became visible, refreshing notification count and padding');
        refetchNotificationCount();
        // Force re-render to ensure Android padding is applied
        setWakeCounter(prev => prev + 1);
      }
    };

    const handleFocus = () => {
      console.log('Bottom nav: Window gained focus, refreshing notification count and padding');
      refetchNotificationCount();
      // Force re-render to ensure Android padding is applied
      setWakeCounter(prev => prev + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, refetchNotificationCount]);

  // Check if user's program has started
  const { data: activityStatus } = useQuery({
    queryKey: ["/api/activities/current"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/activities/current?tzOffset=" + new Date().getTimezoneOffset());
      if (!response.ok) throw new Error("Failed to fetch activity status");
      return response.json();
    },
    enabled: !!user?.teamId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const items = [
    { icon: Home, label: "Home", href: "/", noTeamRequired: true },
    { icon: Calendar, label: "Activity", href: "/activity" },
    { icon: HelpCircle, label: "Help", href: "/help", noTeamRequired: true },
    { icon: Bell, label: "Notifications", href: "/notifications", count: unreadCount, noTeamRequired: true },
  ];

  return (
    <nav
      className={cn(
        // Base styles
        "bg-background shadow-lg",
        // Mobile styles (bottom nav) - always hidden on desktop
        orientation === "horizontal" && "fixed bottom-0 left-0 right-0 border-t border-border md:hidden z-[100]",
        // Desktop styles (side nav) - now we use VerticalNav component instead
        orientation === "vertical" && "w-full hidden"
      )}
      style={{
        paddingBottom: isAndroid ? androidPadding : 'calc(env(safe-area-inset-bottom, 16px) + 32px)',
        transform: orientation === "horizontal" ? `translateY(${scrollOffset}px)` : undefined,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}>
      <div className={cn(
        // Container styles
        "flex items-center",
        // Mobile layout
        orientation === "horizontal" && "h-20 justify-around",
        // Desktop layout
        orientation === "vertical" && "flex-col py-4 space-y-4"
      )}>
        {items.map(({ icon: Icon, label, href, count, noTeamRequired }) => {
          const isActivityLink = href === "/activity";
          const isDisabled = !noTeamRequired && (!user?.teamId || (isActivityLink && activityStatus && !activityStatus.programHasStarted));

          return (
          <div
            key={href}
            onClick={isDisabled ? undefined : () => setLocation(href)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 relative",
              // Size styles
              orientation === "horizontal" ? "h-full w-full pb-4" : "w-full py-2",
              // Disabled or enabled cursor
              isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              // Text styles
              isDisabled
                ? "text-muted-foreground"
                : location === href
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary transition-colors"
            )}
          >
            <Icon className="h-7 w-7" /> {/* Changed from h-5 w-5 */}
            <span className="text-xs">{label}</span>
            {count > 0 && (
              <span className="absolute top-1 -right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {count}
              </span>
            )}
          </div>
          );
        })}
        <div
          onClick={() => setLocation("/menu")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 cursor-pointer",
            // Size styles
            orientation === "horizontal" ? "h-full w-full pb-4" : "w-full py-2",
            // Text styles
            location === "/menu"
              ? "text-primary"
              : "text-muted-foreground hover:text-primary transition-colors"
          )}
        >
          <Menu className="h-7 w-7" /> {/* Changed from h-5 w-5 */}
          <span className="text-xs">Menu</span>
        </div>
      </div>
    </nav>
  );
}