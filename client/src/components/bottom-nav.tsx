import { useLocation, Link } from "wouter";
import { Home, User, Bell, LucideLibrary, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => location === path;

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/profile", icon: User, label: "Profile" },
    { href: "/notifications", icon: Bell, label: "Notifications" },
    { href: "/library", icon: LucideLibrary, label: "Library" },
    { href: "/help", icon: Menu, label: "Menu" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border lg:left-16 lg:border-l">
      <nav className="flex justify-around px-1 py-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <a
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-md",
                isActive(item.href)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </a>
          </Link>
        ))}
      </nav>
    </div>
  );
}