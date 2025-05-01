import React, { useState } from "react";
import { Link as AnchorLink, useLocation } from "wouter";
import { 
  Home, 
  Activity, 
  Bell, 
  Menu,
  Settings, 
  HelpCircle,
  WifiOff,
  Heart,
  Cog,
  Database,
  Image
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  status?: string | null;
  count?: number;
  adminOnly?: boolean;
  onClick?: () => void;
  isDropdown?: boolean;
}

export const VerticalNav = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  const { connectionStatus, fixMemoryVerseThumbnails, fixAllThumbnails, syncMediaFiles } = useNotifications();
  const { unreadCount: prayerRequestCount } = usePrayerRequests();
  const [isLoading, setIsLoading] = useState(false);

  // Admin tools handlers
  const handleFixMemoryVerseThumbnails = async () => {
    setIsLoading(true);
    await fixMemoryVerseThumbnails();
    setIsLoading(false);
  };

  const handleFixAllThumbnails = async () => {
    setIsLoading(true);
    await fixAllThumbnails();
    setIsLoading(false);
  };
  
  const handleSyncMediaFiles = async () => {
    setIsLoading(true);
    await syncMediaFiles();
    setIsLoading(false);
  };

  // Determine if the user is an admin
  const isAdmin = user?.isAdmin === true;

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
    { 
      icon: Heart, 
      label: "Prayer", 
      path: "/prayer-requests",
      count: prayerRequestCount || 0
    },
    { icon: Menu, label: "Menu", path: "/menu" },
  ];

  // Add the admin tools item if the user is an admin
  if (isAdmin) {
    navItems.push({
      icon: Cog,
      label: "Admin",
      path: "#admin-tools",
      isDropdown: true
    });
  }

  return (
    <div className="h-screen w-20 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex">
      {navItems.map((item) => (
        item.isDropdown ? (
          <TooltipProvider key={item.path}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={isLoading}>
                    <button
                      className={cn(
                        "flex flex-col items-center justify-center w-16 h-16 mb-2 rounded-md relative",
                        "hover:bg-muted text-muted-foreground hover:text-foreground",
                        isLoading && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="relative">
                        <item.icon size={20} />
                      </div>
                      <span className="text-xs mt-1">{item.label}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleFixMemoryVerseThumbnails} disabled={isLoading}>
                      <Image className="mr-2 h-4 w-4" />
                      <span>Fix Memory Verse Thumbnails</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleFixAllThumbnails} disabled={isLoading}>
                      <Image className="mr-2 h-4 w-4" />
                      <span>Fix All Thumbnails</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSyncMediaFiles} disabled={isLoading}>
                      <Database className="mr-2 h-4 w-4" />
                      <span>Sync Media Files</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>
                <p>Admin Tools</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
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
                {item.status === "offline" ? (
                  <p>Notification service offline - click to manage</p>
                ) : item.count && item.count > 0 ? (
                  <p>{item.count} new prayer request{item.count !== 1 ? 's' : ''}</p>
                ) : (
                  <p>{item.label}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ))}
    </div>
  );
};