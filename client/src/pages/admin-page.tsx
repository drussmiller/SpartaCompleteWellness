import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { insertTeamSchema, type Team, type User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";  // Updated import path

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppLayout from "@/components/app-layout";

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

  const queryClient = useQueryClient();

  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormData) => {
      try {
        const res = await apiRequest("POST", "/api/teams", data);
        if (!res.ok) {
          // Check if response is HTML (error page)
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
            throw new Error("Server returned an HTML error page. Please try again later.");
          }
          // Try to get a more specific error message
          const errorData = await res.json().catch(() => ({ message: "Failed to create team" }));
          throw new Error(errorData.message || "Failed to create team");
        }
        return res.json();
      } catch (error) {
        console.error("Team creation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      form.reset();
      toast({
        title: "Success",
        description: "Team created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error creating team",
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: Partial<Team>) => {
      const res = await apiRequest("PUT", `/api/teams/${editingTeam?.id}`, data);
      if (!res.ok) throw new Error("Failed to update team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setEditingTeam(null);
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      const res = await apiRequest("PUT", `/api/users/${editingUser?.id}`, data);
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`, { password });
      if (!res.ok) throw new Error("Failed to reset password");
      return res.json();
    },
    onSuccess: () => {
      setResetPasswordOpen(false);
      setSelectedUserId(null);
      setNewPassword("");
      toast({
        title: "Success",
        description: "Password reset successfully",
      });
    },
    onError: (error) => {
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
      if (!res.ok) throw new Error("Failed to delete team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TeamFormData) => {
    createTeamMutation.mutate(data);
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
  };

  const handleResetPassword = (userId: number) => {
    setSelectedUserId(userId);
    setResetPasswordOpen(true);
  };

  const handleSubmitPasswordReset = () => {
    if (selectedUserId) {
      resetPasswordMutation.mutate({ userId: selectedUserId, password: newPassword });
    }
  };

  const handleDeleteTeam = (teamId: number) => {
    if (confirm("Are you sure you want to delete this team?")) {
      deleteTeamMutation.mutate(teamId);
    }
  };

  const handleUpdateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    updateTeamMutation.mutate({ name, description });
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const isTeamLead = formData.get("isTeamLead") === "on";
    const isAdmin = formData.get("isAdmin") === "on";
    const teamId = parseInt(formData.get("teamId") as string) || null;
    updateUserMutation.mutate({ isTeamLead, isAdmin, teamId });
  };

  const handleManageActivities = () => {
    setLocation("/activity-management");
  };

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-gray-500">You do not have permission to access this page.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout sidebarWidth="80">
      <div className="min-h-screen flex flex-col w-full">
        {/* Fixed title bar */}
        <div className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4 flex items-center">
            <h1 className="text-xl font-bold pl-2">Admin Dashboard</h1>
          </div>
        </div>

        <div className="px-4 pt-6 pb-20 flex-1 overflow-auto">
          <Tabs defaultValue="teams">
            <TabsList>
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>

            <TabsContent value="teams" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Create New Team</CardTitle>
                  <CardDescription>
                    Add a new team to the system for grouping users.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Team Name" {...field} />
                            </FormControl>
                            <FormDescription>
                              Enter a name for the team.
                            </FormDescription>
                            <FormMessage />
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
                              <Input placeholder="Team description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={createTeamMutation.isPending}>
                        {createTeamMutation.isPending ? "Creating..." : "Create Team"}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manage Teams</CardTitle>
                  <CardDescription>View and edit existing teams.</CardDescription>
                </CardHeader>
                <CardContent>
                  {teamsLoading ? (
                    <p>Loading teams...</p>
                  ) : teamsError ? (
                    <p className="text-red-500">{(teamsError as Error).message}</p>
                  ) : (
                    <div className="space-y-4">
                      {teams?.map((team) => (
                        <Card key={team.id}>
                          <CardHeader className="py-4">
                            <CardTitle className="text-lg">{team.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="py-2">
                            <p className="text-sm text-muted-foreground">{team.description}</p>
                          </CardContent>
                          <CardFooter className="flex justify-between py-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTeam(team)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteTeam(team.id)}
                            >
                              Delete
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Manage Users</CardTitle>
                  <CardDescription>
                    View and edit user roles and team assignments.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {usersLoading ? (
                    <p>Loading users...</p>
                  ) : usersError ? (
                    <p className="text-red-500">{(usersError as Error).message}</p>
                  ) : (
                    <div className="space-y-4">
                      {users?.map((user) => (
                        <Card key={user.id}>
                          <CardHeader className="py-4">
                            <div className="flex justify-between">
                              <CardTitle className="text-lg">{user.username}</CardTitle>
                              <div className="flex space-x-2">
                                {user.isAdmin && (
                                  <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full">
                                    Admin
                                  </span>
                                )}
                                {user.isTeamLead && (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    Team Lead
                                  </span>
                                )}
                              </div>
                            </div>
                            <CardDescription>
                              {user.email} • Team:{" "}
                              {teams?.find((t) => t.id === user.teamId)?.name || "None"}
                            </CardDescription>
                          </CardHeader>
                          <CardFooter className="flex justify-between py-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                            >
                              Edit Roles
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleResetPassword(user.id)}
                            >
                              Reset Password
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activities" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Manage Activities</CardTitle>
                  <CardDescription>Create and edit weekly activities.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleManageActivities}>Open Activity Management</Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Manage system notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={async () => {
                      try {
                        const res = await apiRequest(
                          "POST",
                          "/api/notifications/check-missed-posts"
                        );

                        // Check content type and handle response appropriately
                        const contentType = res.headers.get("content-type");
                        if (!res.ok || !contentType?.includes("application/json")) {
                          const errorText = await res.text();
                          throw new Error(
                            contentType?.includes("application/json")
                              ? JSON.parse(errorText).message
                              : "Server error: Invalid response format"
                          );
                        }

                        const data = await res.json();
                        toast({
                          title: "Success",
                          description: data.message || "Notifications created successfully"
                        });

                        // Refresh notifications list
                        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                      } catch (error) {
                        console.error("Missed posts notification error:", error);
                        toast({
                          title: "Error",
                          description: error instanceof Error ? error.message : "Failed to create notifications",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    Create Missed Post Notifications
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        const res = await apiRequest(
                          "POST",
                          "/api/notifications/test",
                          {
                            userId: user?.id,
                            title: "Test Notification",
                            message: "This is a test notification from the admin panel"
                          }
                        );

                        // Handle response with proper content type checking
                        const contentType = res.headers.get("content-type");
                        if (!res.ok || !contentType?.includes("application/json")) {
                          const errorText = await res.text();
                          throw new Error(
                            contentType?.includes("application/json")
                              ? JSON.parse(errorText).message
                              : "Server error: Invalid response format"
                          );
                        }

                        const data = await res.json();
                        toast({
                          title: "Success",
                          description: "Test notification created successfully"
                        });

                        // Refresh notifications list
                        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                      } catch (error) {
                        console.error("Test notification error:", error);
                        toast({
                          title: "Error",
                          description: error instanceof Error ? error.message : "Failed to create test notification",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    Create Test Notification
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Team Dialog */}
        <Dialog open={!!editingTeam} onOpenChange={(open) => !open && setEditingTeam(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
              <DialogDescription>Update the team details.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateTeam}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Team Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editingTeam?.name || ""}
                    placeholder="Lowercase with hyphens"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    name="description"
                    defaultValue={editingTeam?.description || ""}
                    placeholder="Team description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateTeamMutation.isPending}>
                  {updateTeamMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User: {editingUser?.username}</DialogTitle>
              <DialogDescription>Update user roles and team assignment.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateUser}>
              <div className="space-y-4 py-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isAdmin"
                    name="isAdmin"
                    defaultChecked={editingUser?.isAdmin}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="isAdmin">Admin Role</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isTeamLead"
                    name="isTeamLead"
                    defaultChecked={editingUser?.isTeamLead}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="isTeamLead">Team Lead Role</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teamId">Assign to Team</Label>
                  <select
                    id="teamId"
                    name="teamId"
                    defaultValue={editingUser?.teamId || ""}
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="">No Team</option>
                    {teams?.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset User Password</DialogTitle>
              <DialogDescription>
                Enter a new password for this user. They will need to use this password for their next
                login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSubmitPasswordReset} disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}