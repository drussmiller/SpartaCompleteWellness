import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, Plus, Lock, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { insertTeamSchema, type Team, type User } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/bottom-nav";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel,
  AlertDialogContent, 
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Type definition for form data
type TeamFormData = z.infer<typeof insertTeamSchema>;

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<TeamFormData>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormData) => {
      const res = await apiRequest("POST", "/api/teams", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await apiRequest("DELETE", `/api/teams/${teamId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { teamId });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user's team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's team updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role, value }: { userId: number; role: 'isAdmin' | 'isTeamLead'; value: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role, value });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's role updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }: { teamId: number; data: Partial<Team> }) => {
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
      setEditingTeam(null);
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: Partial<User> }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = teamsLoading || usersLoading;
  const error = teamsError || usersError;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading activities...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Data</h2>
              <p className="text-gray-600">{error instanceof Error ? error.message : 'An error occurred'}</p>
              <Button
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/activities"] })}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Unauthorized</h2>
              <p className="text-gray-600">You do not have permission to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const sortedTeams = [...(teams || [])].sort((a, b) => a.name.localeCompare(b.name));
  const sortedUsers = [...(users || [])].sort((a, b) => (a.username || '').localeCompare(b.username || ''));

  const isMobile = window.innerWidth <= 768; 

  return (
    <AppLayout sidebarWidth="80">
      <div className="min-h-screen flex flex-col w-full">
        {/* Fixed title bar */}
        <div className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4 flex items-center">
            <h1 className="text-xl font-bold pl-2">Admin Dashboard</h1>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1">
          <div className="container p-4 md:px-8">
            <Tabs defaultValue="users" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="users">User Management</TabsTrigger>
                <TabsTrigger value="activities">Activity Management</TabsTrigger>
                <TabsTrigger value="teams">Team Management</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              <TabsContent value="users" className="space-y-4">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Users</h2>
                  {/* Existing user management content */}
                  {sortedUsers?.map((user) => (
                    <Card key={user.id}>
                      {/* ...rest of user card content... */}
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="teams" className="space-y-4">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Teams</h2>
                  {/* Existing team management content */}
                  {sortedTeams?.map((team) => (
                    <Card key={team.id}>
                      {/* ...rest of team card content... */}
                    </Card>
                  ))}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="default" className="px-4 bg-violet-700 text-white hover:bg-violet-800">
                        <Plus className="h-4 w-4 mr-2" />
                        New Team
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Team</DialogTitle>
                      </DialogHeader>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Name</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Textarea {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <Button type="submit" disabled={createTeamMutation.isPending}>
                            {createTeamMutation.isPending ? "Creating..." : "Create Team"}
                          </Button>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </TabsContent>
              <TabsContent value="activities" className="space-y-4">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Activity Management</h2>
                  {/* Existing activity management content */}
                  <Button
                    size="default"
                    className="px-4 bg-violet-700 text-white hover:bg-violet-800"
                    onClick={() => setLocation("/activity-management")}
                  >
                    Activity Management
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-4">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Notification Management</h2>

                  <Card>
                    <CardHeader>
                      <CardTitle>Check for Missed Posts</CardTitle>
                      <CardDescription>
                        Creates notifications for users who didn't complete all required posts yesterday
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={async () => {
                          try {
                            const response = await apiRequest(
                              "POST", 
                              "/api/notifications/check-missed-posts"
                            );

                            if (!response.ok) {
                              throw new Error("Failed to check for missed posts");
                            }

                            const result = await response.json();
                            toast({
                              title: "Check Complete",
                              description: `Created ${result.notificationsCreated} notifications for missed posts.`,
                            });
                          } catch (error) {
                            toast({
                              title: "Error",
                              description: error instanceof Error ? error.message : "Failed to check missed posts",
                              variant: "destructive"
                            });
                          }
                        }}
                      >
                        Check Missed Posts
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter a new password for the user.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (selectedUserId && newPassword) {
                // Handle password reset
                setResetPasswordOpen(false);
                setNewPassword("");
              }
            }}>
              <div className="space-y-4 mt-2">
                <div className="relative">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    required
                  />
                </div>
                <Button type="submit">
                  Reset Password
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <BottomNav />
      </div>
    </AppLayout>
  );
}