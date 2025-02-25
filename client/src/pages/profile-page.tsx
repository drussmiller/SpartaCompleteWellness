import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Camera, Lock } from "lucide-react";
import { z } from "zod";
import { useState, useEffect } from "react";


const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1)
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const { user: authUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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

                      const updatedUser = await res.json();
                      queryClient.setQueryData(["/api/user"], updatedUser);
                      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                      toast({
                        title: "Success",
                        description: "Profile picture updated successfully"
                      });
                    } catch (error) {
                      console.error('Error updating profile image:', error);
                      toast({
                        title: "Error",
                        description: "Failed to update profile image",
                        variant: "destructive"
                      });
                    }
                  }}
                />
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold">{user?.username}</h2>
              <p className="text-muted-foreground">{user?.points} points</p>
              {user?.teamName && (
                <div className="mt-1">Team: {user?.teamName}</div>
              )}
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setChangePasswordOpen(true)}
            >
              <Lock className="w-4 h-4 mr-2" />
              Change Password
            </Button>
          </CardContent>
        </Card>
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </Button>

      </main>
      <BottomNav/>
    </div>
  );
}