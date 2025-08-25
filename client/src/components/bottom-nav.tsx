import { useLocation } from "wouter";
import { Home, Calendar, HelpCircle, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

interface BottomNavProps {
  orientation?: "horizontal" | "vertical";
  isVisible?: boolean;
  scrollOffset?: number;
}

export function BottomNav({ orientation = "horizontal", isVisible = true, scrollOffset = 0 }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  // Add debug logging to verify props
  console.log('BottomNav render - isVisible:', isVisible);

  // Query for unread notifications count
  const { data: unreadCount = 0 } = useQuery({
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
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  // Filter navigation items based on team membership
  const baseNavItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: HelpCircle, label: "Help", path: "/help" },
    { icon: Menu, label: "Menu", path: "/menu" },
  ];

  const teamMemberNavItems = [
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
  ];

  // Show all navigation items but disable team-required ones for users without teams
  const allNavItems = [...baseNavItems.slice(0, 1), ...teamMemberNavItems, ...baseNavItems.slice(1)];
  const navItems = allNavItems;

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
        {navItems.map(({ icon: Icon, label, path, count }) => {
          const isTeamRequired = ["/activity", "/notifications"].includes(path);
          const isDisabled = isTeamRequired && !user?.teamId;
          
          return (
            <div
              key={path}
              onClick={() => {
                if (!isDisabled) {
                  setLocation(path);
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 relative",
                // Size styles
                orientation === "horizontal" ? "h-full w-full pb-4" : "w-full py-2",
                // Cursor and interaction styles
                isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                // Text styles
                isDisabled ? "text-muted-foreground/50" :
                location === path
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary transition-colors"
              )}
              title={isDisabled ? "Requires team assignment" : undefined}
            ></div>
          );
        })}
            <Icon className="h-7 w-7" /> {/* Changed from h-5 w-5 */}
            <span className="text-xs">{label}</span>
            {count > 0 && (
              <span className="absolute top-1 -right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {count}
              </span>
            )}
          </div>
        ))}
        {/* The Menu item is now conditionally rendered as part of navItems */}
      </div>
    </nav>
  );
}