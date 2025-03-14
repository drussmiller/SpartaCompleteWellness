import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, User, Settings } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import ProfilePage from "./profile-page";
import AdminPage from "./admin-page";
import { useState } from "react";

export default function MenuPage() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  if (!user) return null;

  return (
    <AppLayout>
      <div className="flex flex-col items-center p-6 space-y-6">
        {/* User Info Section */}
        <div className="flex flex-col items-center space-y-4 w-full">
          <Avatar className="w-24 h-24">
            <AvatarImage
              src={user.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`}
              alt={user.username}
            />
            <AvatarFallback>
              {user.username?.[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-2xl font-bold">{user.preferredName || user.username}</h2>
            <p className="text-muted-foreground">Team {user.teamId}</p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="w-full space-y-2">
          {/* Profile Sheet */}
          <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start bg-violet-700 text-white hover:bg-violet-800" size="lg">
                <User className="mr-2 h-5 w-5" />
                Profile Settings
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[540px] p-0">
              <ProfilePage onClose={() => setProfileOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Admin Sheet - Only shown for admin users */}
          {user.isAdmin && (
            <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-start bg-violet-700 text-white hover:bg-violet-800" size="lg">
                  <Settings className="mr-2 h-5 w-5" />
                  Admin Dashboard
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[540px] p-0">
                <AdminPage onClose={() => setAdminOpen(false)} />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </AppLayout>
  );
}