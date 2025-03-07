
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  Home, 
  Activity, 
  Bell, 
  User, 
  Settings, 
  HelpCircle,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const VerticalNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  
  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Activity, label: "Activity", path: "/activity" },
    { icon: Bell, label: "Alerts", path: "/notifications" },
    { icon: User, label: "Profile", path: "/profile" },
    ...(user?.isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
    { icon: HelpCircle, label: "Help", path: "/help" },
  ];

  return (
    <div className="h-screen w-16 fixed top-0 left-0 flex flex-col items-center bg-background border-r border-border pt-4 hidden md:flex">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 mb-2 rounded-md",
            location.pathname === item.path
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <item.icon size={20} />
          <span className="text-xs mt-1">{item.label}</span>
        </Link>
      ))}
    </div>
  );
};
