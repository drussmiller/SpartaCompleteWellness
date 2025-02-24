import { Link, useLocation } from "wouter";
import { Home, Library, HelpCircle, Bell, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const items = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Library, label: "Library", href: "/library" },
    { icon: HelpCircle, label: "Help", href: "/help" },
    { icon: Bell, label: "Notifications", href: "/notifications" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
      <div className="flex justify-around items-center h-16">
        {items.map(({ icon: Icon, label, href }) => (
          <Link key={href} href={href}>
            <button
              className={cn(
                "flex flex-col items-center justify-center w-full h-full text-sm gap-1",
                location === href
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary transition-colors"
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
                "flex flex-col items-center justify-center w-full h-full text-sm gap-1",
                location === "/admin"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary transition-colors"
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
              "flex flex-col items-center justify-center w-full h-full text-sm gap-1",
              location === "/profile"
                ? "text-primary"
                : "text-muted-foreground hover:text-primary transition-colors"
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