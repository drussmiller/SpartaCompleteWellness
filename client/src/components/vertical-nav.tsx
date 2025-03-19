import React from "react";
import { Link as AnchorLink, useLocation } from "wouter";
import { 
  Home, 
  Activity, 
  Bell, 
  Menu,
  Settings, 
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const VerticalNav = () => {
  const [location] = useLocation();
  const { user } = useAuth();

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    { icon: Menu, label: "Menu", path: "/menu" },
    { icon: HelpCircle, label: "Help", path: "/help" },
  ];

  return (
    <div className="h-screen w-20 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex">
      {navItems.map((item) => (
        <AnchorLink
          key={item.path}
          href={item.path}
          className={cn(
            "flex flex-col items-center justify-center w-16 h-16 mb-2 rounded-md",
            location === item.path
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <item.icon size={20} />
          <span className="text-xs mt-1">{item.label}</span>
        </AnchorLink>
      ))}
    </div>
  );
};