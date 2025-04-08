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
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

export const VerticalNav = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  const { connectionStatus } = useNotifications();

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: HelpCircle, label: "Help", path: "/help" },
    { 
      icon: Bell, 
      label: "Notifications", 
      path: "/notifications",
      status: connectionStatus !== "connected" ? "offline" : null 
    },
    { icon: Clock, label: "Schedule", path: "/notification-schedule" },
    { icon: Menu, label: "Menu", path: "/menu" },
  ];

  return (
    <div className="h-screen w-20 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex">
      {navItems.map((item) => (
        <TooltipProvider key={item.path}>
          <Tooltip>
            <TooltipTrigger asChild>
              <AnchorLink
                href={item.path}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-16 mb-2 rounded-md relative",
                  location === item.path
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <item.icon size={20} />
                  {item.status === "offline" && (
                    <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-background">
                      <WifiOff className="h-2 w-2 text-white" />
                    </div>
                  )}
                </div>
                <span className="text-xs mt-1">{item.label}</span>
              </AnchorLink>
            </TooltipTrigger>
            <TooltipContent>
              {item.status === "offline" ? (
                <p>Notification service offline - click to manage</p>
              ) : (
                <p>{item.label}</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
};