import { Link, useLocation } from "wouter";
import { Home, Calendar, HelpCircle, Bell, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const items = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Calendar, label: "Activity", href: "/activity" },
    { icon: HelpCircle, label: "Help", href: "/help" },
    { icon: Bell, label: "Notifications", href: "/notifications" },
  ];

  return (
    <nav className={cn(
      // Base styles
      "bg-background z-[100] shadow-lg",
      // Mobile styles (bottom nav)
      "lg:hidden fixed bottom-0 left-0 right-0 border-t border-border",
      // Desktop styles (side nav)
      "lg:fixed lg:left-0 lg:top-0 lg:h-full lg:w-16 lg:border-r lg:flex lg:flex-col"
    )}>
      <div className={cn(
        // Mobile layout
        "flex justify-around items-center h-16",
        // Desktop layout
        "lg:flex-col lg:h-full lg:py-4 lg:space-y-4"
      )}>
        {items.map(({ icon: Icon, label, href }) => (
          <Link key={href} href={href}>
            <a className={cn(
              "flex flex-col items-center justify-center w-full text-sm gap-1",
              // Mobile styles
              "h-full",
              // Desktop styles
              "lg:h-16 lg:w-16",
              location === href
                ? "text-primary"
                : "text-muted-foreground hover:text-primary transition-colors"
            )}>
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </a>
          </Link>
        ))}
        {user?.isAdmin && (
          <Link href="/admin">
            <a className={cn(
              "flex flex-col items-center justify-center w-full text-sm gap-1",
              // Mobile styles
              "h-full",
              // Desktop styles
              "lg:h-16 lg:w-16",
              location === "/admin"
                ? "text-primary"
                : "text-muted-foreground hover:text-primary transition-colors"
            )}>
              <Shield className="h-5 w-5" />
              <span className="text-xs">Admin</span>
            </a>
          </Link>
        )}
        <Link href="/profile">
          <a className={cn(
            "flex flex-col items-center justify-center w-full text-sm gap-1",
            // Mobile styles
            "h-full",
            // Desktop styles
            "lg:h-16 lg:w-16",
            location === "/profile"
              ? "text-primary"
              : "text-muted-foreground hover:text-primary transition-colors"
          )}>
            <User className="h-5 w-5" />
            <span className="text-xs">Profile</span>
          </a>
        </Link>
      </div>
    </nav>
  );
}