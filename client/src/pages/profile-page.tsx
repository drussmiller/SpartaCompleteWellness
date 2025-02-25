import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";

export default function ProfilePage() {
  const { user: authUser, logoutMutation } = useAuth();
  const { toast } = useToast();

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ["/api/user"],
    staleTime: 0,
    enabled: !!authUser,
  });

  useEffect(() => {
    console.log('Profile page user data updated:', user);
  }, [user]);

  useEffect(() => {
    console.log('Refetching user data');
    refetchUser();
  }, [refetchUser]);

  const handleRefresh = async () => {
    console.log('Manual refresh requested');
    await refetchUser();
    toast({
      title: "Refreshed",
      description: "Profile data has been refreshed"
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Profile</h1>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
          >
            Refresh Data
          </Button>
        </div>
      </header>
      <main className="p-4 space-y-6">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage
                  src={user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.username}`}
                  alt={user?.username}
                />
                <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 rounded-full">
                <Input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append('image', file);

                    try {
                      const res = await fetch('/api/user/image', {
                        method: 'POST',
                        body: formData,
                      });

                      if (!res.ok) {
                        throw new Error('Failed to update profile image');
                      }

                      await refetchUser();
                      toast({
                        title: "Success",
                        description: "Profile image updated successfully"
                      });
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to update profile image",
                        variant: "destructive"
                      });
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{user?.username}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3>My Stats</h3>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Points</p>
              <p className="text-xl font-semibold">{user?.points || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Button variant="destructive" onClick={handleLogout} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
          <LogOut className="ml-2 h-4 w-4"/>
        </Button>
      </main>
    </div>
  );
}