import { useLocation } from "wouter";
import { Home, Calendar, HelpCircle, Bell, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface BottomNavProps {
  orientation?: "horizontal" | "vertical";
}

export function BottomNav({ orientation = "horizontal" }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const items = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Calendar, label: "Activity", href: "/activity" },
    { icon: HelpCircle, label: "Help", href: "/help" },
    { icon: Bell, label: "Alert", href: "/notifications" },
  ];

  return (
    <nav className={cn(
      // Base styles
      "bg-background z-[100]",
      // Mobile styles (bottom nav)
      orientation === "horizontal" && "fixed bottom-0 left-0 right-0 border-t border-border md:hidden",
      // Desktop styles (side nav)
      orientation === "vertical" && "w-16 h-full"
    )}>
      <div className={cn(
        // Base styles
        "flex items-center",
        // Mobile layout
        orientation === "horizontal" && "h-16 justify-around",
        // Desktop layout
        orientation === "vertical" && "flex-col h-full py-6 space-y-6"
      )}>
        {items.map(({ icon: Icon, label, href }) => (
          <div
            key={href}
            onClick={() => setLocation(href)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 cursor-pointer",
              // Size styles
              orientation === "horizontal" ? "h-full w-full" : "w-full px-3",
              // Text styles
              location === href
                ? "text-primary"
                : "text-muted-foreground hover:text-primary transition-colors"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-xs">{label}</span>
          </div>
        ))}
        {user?.isAdmin && (
          <div
            onClick={() => setLocation("/admin")}
            className={cn(
              "flex flex-col items-center justify-center gap-1 cursor-pointer",
              orientation === "horizontal" ? "h-full w-full" : "w-full px-3",
              location === "/admin"
                ? "text-primary"
                : "text-muted-foreground hover:text-primary transition-colors"
            )}
          >
            <Shield className="h-5 w-5" />
            <span className="text-xs">Admin</span>
          </div>
        )}
        <div
          onClick={() => setLocation("/profile")}
          className={cn(
            "flex flex-col items-center justify-center gap-1 cursor-pointer",
            orientation === "horizontal" ? "h-full w-full" : "w-full px-3",
            location === "/profile"
              ? "text-primary"
              : "text-muted-foreground hover:text-primary transition-colors"
          )}
        >
          <User className="h-5 w-5" />
          <span className="text-xs">Profile</span>
        </div>
      </div>
    </nav>
  );
}