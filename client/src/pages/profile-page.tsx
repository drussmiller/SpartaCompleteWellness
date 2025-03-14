
import { useQuery } from "@tanstack/react-query";
import { UserProfile } from "@/components/profile";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfilePageProps {
  onClose?: () => void;
}

export default function ProfilePage({ onClose }: ProfilePageProps) {
  const { user, logoutMutation } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4 flex items-center">
          {onClose && (
            <button onClick={onClose} className="mr-2">
              Back
            </button>
          )}
          <h1 className="font-bold">Profile</h1>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="p-4">
          <UserProfile user={user} />
        </div>

        <Button variant="destructive" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
          <LogOut className="ml-2 h-4 w-4"/>
        </Button>
      </ScrollArea>

      <div className="fixed bottom-0 left-0 lg:left-16 right-0 z-50">
        <BottomNav />
      </div>
    </div>
  );
}
