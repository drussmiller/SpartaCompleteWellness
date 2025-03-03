
import { Logo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";

export function TopNav() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full bg-background border-b border-border">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo />
        </div>
        <nav className="flex items-center">
          <Link href="/profile">
            <a className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={user?.profileImageUrl || ""}
                  alt={user?.username || "User"}
                />
                <AvatarFallback>
                  {user?.username?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </a>
          </Link>
        </nav>
      </div>
    </header>
  );
}
