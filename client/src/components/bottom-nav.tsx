import { Link, useLocation } from "wouter";
import { Home, Library, HelpCircle, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();

  const items = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Library, label: "Library", href: "/library" },
    { icon: HelpCircle, label: "Help", href: "/help" },
    { icon: Bell, label: "Notifications", href: "/notifications" },
    { icon: User, label: "Profile", href: "/profile" },
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
      </div>
    </nav>
  );
}