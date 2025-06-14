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
}

export function BottomNav({ orientation = "horizontal", isVisible = true }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

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

  const items = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Calendar, label: "Activity", href: "/activity" },
    { icon: HelpCircle, label: "Help", href: "/help" },
    { 
      icon: Bell, 
      label: "Notifications", 
      href: "/notifications",
      count: unreadCount 
    },
  ];

  return (
    <nav 
      className={cn(
        // Base styles
        "bg-background z-[100] shadow-lg",
        // Mobile styles (bottom nav) - always hidden on desktop
        orientation === "horizontal" && "fixed bottom-0 left-0 right-0 border-t border-border md:hidden",
        // Desktop styles (side nav) - now we use VerticalNav component instead
        orientation === "vertical" && "w-full hidden"
      )}
      style={orientation === "horizontal" ? {
        transform: isVisible ? 'translateY(0px)' : 'translateY(100%)',
        transition: 'transform 0.7s ease-in-out'
      } : undefined}>
      <div className={cn(
        // Container styles
        "flex items-center",
        // Mobile layout
        orientation === "horizontal" && "h-20 justify-around",
        // Desktop layout
        orientation === "vertical" && "flex-col py-4 space-y-4"
      )}>
        {items.map(({ icon: Icon, label, href, count }) => (
          <div
            key={href}
            onClick={() => setLocation(href)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 cursor-pointer relative",
              // Size styles
              orientation === "horizontal" ? "h-full w-full pb-4" : "w-full py-2",
              // Text styles
              location === href
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
        ))}
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