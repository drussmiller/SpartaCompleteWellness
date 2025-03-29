import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Menu, Bell, Settings } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import ProfilePage from "./profile-page";
import AdminPage from "./admin-page";
import { NotificationSchedule } from "@/components/notification-schedule";
import { useState } from "react";

export default function MenuPage() {
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationScheduleOpen, setNotificationScheduleOpen] = useState(false);

  if (!user) return null;

  return (
    <AppLayout>
      <div className="flex flex-col p-6 space-y-6">
        <h1 className="text-xl font-bold">Menu</h1>

        {/* Navigation Section */}
        <div className="w-full space-y-2">
          {/* Profile Sheet */}
          <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full justify-start py-6" size="lg">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.username}`}
                      alt={user.username}
                    />
                    <AvatarFallback>
                      {user.username?.[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <div className="font-medium">{user.preferredName || user.username}</div>
                  </div>
                </div>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[640px] p-0">
              <ProfilePage onClose={() => setProfileOpen(false)} />
            </SheetContent>
          </Sheet>

          <Button
            variant="outline"
            className="w-full justify-start"
            size="lg"
            onClick={() => navigate('/notification-schedule')}
          >
            <Bell className="mr-2 h-5 w-5" />
            Notification Schedule
          </Button>

          {/* Admin Sheet - Only shown for admin users */}
          {user.isAdmin && (
            <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-start" size="lg">
                  <Settings className="mr-2 h-5 w-5" />
                  Admin Dashboard
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[640px] p-0">
                <AdminPage onClose={() => setAdminOpen(false)} />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </AppLayout>
  );
}