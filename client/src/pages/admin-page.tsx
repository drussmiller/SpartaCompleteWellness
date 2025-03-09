import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, Plus, Lock, Trash2, Loader2, Bell } from "lucide-react";
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
    queryFn: async () => {
      return apiRequest("GET", "/api/teams");
    }
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      return apiRequest("GET", "/api/users");
    }
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
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  onClick={() => {
                    // Invalidate all query data to ensure a fresh start
                    queryClient.invalidateQueries();
                    // Specifically invalidate the teams and users queries
                    queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                    // Force window reload if needed
                    if (error instanceof Error && error.message.includes('HTML')) {
                      window.location.reload();
                    }
                  }}
                >
                  Retry
                </Button>
                {error instanceof Error && error.message.includes('HTML') && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Reload Page
                  </Button>
                )}
              </div>
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
            <div className="flex gap-2 mt-4 justify-center">
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
              <Button
                size="default"
                className="px-4 bg-violet-700 text-white hover:bg-violet-800"
                onClick={() => setLocation("/activity-management")}
              >
                Activity Management
              </Button>
            </div>
            
            <div className="flex justify-center mt-2 gap-2">
              <Button
                size="default"
                className="px-4 bg-violet-700 text-white hover:bg-violet-800"
                onClick={() => {
                  apiRequest("POST", "/api/admin/send-test-notification")
                    .then(() => {
                      toast({
                        title: "Success",
                        description: "Test notification sent successfully",
                      });
                      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                    })
                    .catch((error) => {
                      toast({
                        title: "Error",
                        description: error.message || "Failed to send test notification",
                        variant: "destructive",
                      });
                    });
                }}
              >
                <Bell className="h-4 w-4 mr-2" />
                Send Test Notification
              </Button>
              <Button
                size="default"
                className="px-4 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  apiRequest("GET", "/api/notifications")
                    .then((data) => {
                      if (data && data.length > 0) {
                        toast({
                          title: "Notifications",
                          description: `Found ${data.length} notifications. Latest: "${data[0].title}" (${new Date(data[0].createdAt).toLocaleString()})`,
                        });
                      } else {
                        toast({
                          title: "No Notifications",
                          description: "No notifications found in database",
                        });
                      }
                    })
                    .catch((error) => {
                      toast({
                        title: "Error",
                        description: error.message || "Failed to fetch notifications",
                        variant: "destructive",
                      });
                    });
                }}
              >
                <Bell className="h-4 w-4 mr-2" />
                View Notifications
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="border rounded-lg p-4">
                <h2 className="text-2xl font-semibold mb-4">Teams</h2>
                <div className="space-y-4">
                  {sortedTeams?.map((team) => (
                    <Card key={team.id}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {editingTeam?.id === team.id ? (
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                updateTeamMutation.mutate({
                                  teamId: team.id,
                                  data: {
                                    name: formData.get('name') as string,
                                    description: formData.get('description') as string,
                                  }
                                });
                              }}>
                                <div className="space-y-2">
                                  <Input
                                    name="name"
                                    defaultValue={team.name}
                                    className="font-semibold"
                                  />
                                  <Textarea
                                    name="description"
                                    defaultValue={team.description || ''}
                                    className="text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <Button type="submit" size="sm">Save</Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingTeam(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </form>
                            ) : (
                              <>
                                <CardTitle className="text-lg">{team.name}</CardTitle>
                                <CardDescription className="line-clamp-2 text-sm">
                                  {team.description}
                                </CardDescription>
                              </>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingTeam(team)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="bg-white hover:bg-red-50 text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this team?")) {
                                  deleteTeamMutation.mutate(team.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">
                          <span className="font-medium">Members: </span>
                          {sortedUsers?.filter((u) => u.teamId === team.id).length || 0}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h2 className="text-2xl font-semibold mb-4">Users</h2>
                <div className="space-y-4">
                  {sortedUsers?.map((user) => (
                    <Card key={user.id}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            {editingUser?.id === user.id ? (
                              <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                updateUserMutation.mutate({
                                  userId: user.id,
                                  data: {
                                    username: formData.get('username') as string,
                                    email: formData.get('email') as string,
                                  }
                                });
                              }}>
                                <div className="space-y-2">
                                  <Input
                                    name="username"
                                    defaultValue={user.username}
                                    className="font-semibold"
                                  />
                                  <Input
                                    name="email"
                                    defaultValue={user.email}
                                    type="email"
                                    className="text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <Button type="submit" size="sm">Save</Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingUser(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <CardTitle>{user.preferredName || user.username}</CardTitle>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingUser(user)}
                                    >
                                      Edit
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          className="bg-white hover:bg-red-50 text-red-600"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This action cannot be undone. This will permanently delete the user
                                          account and all associated data.
                                        </AlertDialogDescription>
                                        <div className="flex items-center justify-end gap-2 mt-4">
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-red-600 hover:bg-red-700 text-white"
                                            onClick={() => deleteUserMutation.mutate(user.id)}
                                          >
                                            Delete User
                                          </AlertDialogAction>
                                        </div>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>
                                <CardDescription>{user.email}</CardDescription>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  Start Date: {new Date(user.createdAt!).toLocaleDateString()}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                  Progress: Week {user.currentWeek}, Day {user.currentDay}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {user.isAdmin && <Badge variant="default">Admin</Badge>}
                            {user.isTeamLead && <Badge variant="secondary">Team Lead</Badge>}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Team Assignment</p>
                          <Select
                            defaultValue={user.teamId?.toString() || "none"}
                            onValueChange={(value) => {
                              const teamId = value === "none" ? null : parseInt(value);
                              updateUserTeamMutation.mutate({ userId: user.id, teamId });
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a team" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Team</SelectItem>
                              {sortedTeams?.map((team) => (
                                <SelectItem key={team.id} value={team.id.toString()}>
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">Roles</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={user.isAdmin ? "default" : "outline"}
                              size="sm"
                              className={user.isAdmin ? "bg-violet-700 text-white hover:bg-violet-800" : ""}
                              onClick={() => {
                                // Prevent removing admin from the admin user with username "admin"
                                if (user.username === "admin" && user.isAdmin) {
                                  toast({
                                    title: "Cannot Remove Admin",
                                    description: "This is the main administrator account and cannot have admin rights removed.",
                                    variant: "destructive"
                                  });
                                  return;
                                }
                                updateUserRoleMutation.mutate({
                                  userId: user.id,
                                  role: 'isAdmin',
                                  value: !user.isAdmin
                                });
                              }}
                            >
                              Admin
                            </Button>
                            <Button
                              variant={user.isTeamLead ? "default" : "outline"}
                              size="sm"
                              className={user.isTeamLead ? "bg-violet-700 text-white hover:bg-violet-800" : ""}
                              onClick={() => {
                                updateUserRoleMutation.mutate({
                                  userId: user.id,
                                  role: 'isTeamLead',
                                  value: !user.isTeamLead
                                });
                              }}
                            >
                              Team Lead
                            </Button>
                          </div>
                        </div>

                        <div className="pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full bg-violet-700 text-white hover:bg-violet-800"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setResetPasswordOpen(true);
                            }}
                          >
                            <Lock className="h-4 w-4 mr-1" />
                            Reset Password
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
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