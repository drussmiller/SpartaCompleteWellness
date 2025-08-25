import React from "react";
import { Link as AnchorLink, useLocation } from "wouter";
import { 
  Home, 
  Activity, 
  Bell, 
  Menu,
  Settings, 
  HelpCircle,
  WifiOff,
  Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { usePrayerRequests } from "@/hooks/use-prayer-requests";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  status?: string | null;
  count?: number;
  requiresTeam?: boolean;
}

export const VerticalNav = () => {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { connectionStatus } = useNotifications();
  const { unreadCount: prayerRequestCount } = usePrayerRequests();

  const navItems: NavItem[] = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Activity, label: "Activity", path: "/activity", requiresTeam: true },
    { icon: HelpCircle, label: "Help", path: "/help" },
    { 
      icon: Bell, 
      label: "Notifications", 
      path: "/notifications",
      status: connectionStatus !== "connected" ? "offline" : null 
    },
    { icon: Menu, label: "Menu", path: "/menu", requiresTeam: true },
  ];

  return (
    <div className="h-screen w-20 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex z-[100]">
      {navItems.map(({ icon: Icon, label, path, status, count, requiresTeam }) => {
          const isActive = location === path;
          const isDisabled = requiresTeam && !user?.teamId;

          return (
            <TooltipProvider key={path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    onClick={() => !isDisabled && setLocation(path)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                      isDisabled 
                        ? "opacity-50 cursor-not-allowed" 
                        : "cursor-pointer",
                      isActive && !isDisabled
                        ? "bg-accent text-accent-foreground"
                        : !isDisabled 
                          ? "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          : "text-muted-foreground"
                    )}
                    title={isDisabled ? "Requires team assignment" : undefined}
                  >
                    <div className="relative">
                      <Icon className="h-5 w-5" />
                      {count && count > 0 && !isDisabled && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                      {status === "offline" && !isDisabled && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isDisabled ? "Requires team assignment" : label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
    </div>
  );
};