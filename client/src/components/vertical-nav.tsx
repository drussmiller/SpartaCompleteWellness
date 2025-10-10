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
}

export const VerticalNav = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  const { connectionStatus } = useNotifications();
  const { unreadCount: prayerRequestCount } = usePrayerRequests();

  const navItems: NavItem[] = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: HelpCircle, label: "Help", path: "/help" },
    {
      icon: Bell,
      label: "Notifications",
      path: "/notifications",
      status: connectionStatus !== "connected" ? "offline" : null
    },


    { icon: Menu, label: "Menu", path: "/menu" },
  ];

  return (
    <div className="h-screen w-20 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex z-[100]">
      {navItems.map((item) => {
        const isDisabled = !user?.teamId && (item.path === "/activity" || item.path === "/notifications");

        return (
        <TooltipProvider key={item.path}>
          <Tooltip>
            <TooltipTrigger asChild>
              <AnchorLink
                href={isDisabled ? "#" : item.path}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-16 mb-2 rounded-md relative",
                  isDisabled
                    ? "opacity-50 cursor-not-allowed text-muted-foreground"
                    : location === item.path
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                onClick={isDisabled ? (e) => e.preventDefault() : undefined}
              >
                <div className="relative">
                  <item.icon size={20} />
                  {item.status === "offline" && (
                    <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-background">
                      <WifiOff className="h-2 w-2 text-white" />
                    </div>
                  )}
                  {item.count && item.count > 0 && (
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border border-background flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">{item.count > 99 ? '99+' : item.count}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs mt-1">{item.label}</span>
              </AnchorLink>
            </TooltipTrigger>
            <TooltipContent>
              {isDisabled ? (
                <p>Team Required - {item.label}</p>
              ) : item.status === "offline" ? (
                <p>Notification service offline - click to manage</p>
              ) : item.count && item.count > 0 ? (
                <p>{item.count} new prayer request{item.count !== 1 ? 's' : ''}</p>
              ) : (
                <p>{item.label}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        );
      })}
    </div>
  );
};