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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg">
      <div className="grid grid-cols-5 h-16 relative">
        {items.map(({ icon: Icon, label, href }) => (
          <Link key={href} href={href}>
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full h-full text-sm gap-1 relative",
                location === href
                  ? "text-black [&>svg]:text-black border-b-2 border-primary" //Increased contrast and border for active state
                  : "text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-colors" //Increased contrast and hover effect
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          </Link>
        ))}
        {user?.isAdmin && (
          <Link href="/admin">
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full h-full text-sm gap-1 relative",
                location === "/admin"
                  ? "text-black [&>svg]:text-black border-b-2 border-primary"
                  : "text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-colors"
              )}
            >
              <Shield className="h-5 w-5" />
              <span>Admin</span>
            </button>
          </Link>
        )}
        <Link href="/profile">
          <button
            className={cn(
              "flex flex-col items-center justify-center w-full h-full text-sm gap-1 relative",
              location === "/profile"
                ? "text-black [&>svg]:text-black border-b-2 border-primary"
                : "text-gray-600 hover:text-primary hover:border-b-2 hover:border-primary transition-colors"
            )}
          >
            <User className="h-5 w-5" />
            <span>Profile</span>
          </button>
        </Link>
      </div>
    </nav>
  );
}