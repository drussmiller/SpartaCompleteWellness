import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, ChevronDown, Plus, Lock, Trash2, Loader2, Settings, BarChart3, MessageSquare, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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

interface AdminPageProps {
  onClose?: () => void;
}

// Basic Collapsible Component (replace with your actual implementation)
const Collapsible = ({ children, user }: { children: React.ReactNode, user: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 cursor-pointer hover:bg-gray-100"
      >
        <span className={!user.teamId ? "font-bold" : ""}>
          {user.username}{user.preferredName ? ` (${user.preferredName})` : ''}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      <div style={{ display: isOpen ? 'block' : 'none' }}>
        {children}
      </div>
    </div>
  );
};

const CollapsibleContent = ({ children }: { children: React.ReactNode }) => {
  return <div>{children}</div>;
};


export default function AdminPage({ onClose }: AdminPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();
  const [userProgress, setUserProgress] = useState<Record<number, { 
    week: number; 
    day: number; 
    debug?: {
      teamJoinedAt: string;
      programStartDate: string;
      userLocalNow: string;
      timezone: string;
    }
  }>>({});

  // Get timezone offset for current user (in minutes)
  const tzOffset = new Date().getTimezoneOffset();

  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  // Create team form
  const createTeamForm = useForm<TeamFormData>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Edit team form  
  const editTeamForm = useForm<TeamFormData>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Edit user form
  const editUserForm = useForm<Partial<User>>({
    defaultValues: {
      username: "",
      email: "",
      preferredName: "",
      teamId: null,
    },
  });

  // Set form values when editing team
  useEffect(() => {
    if (editingTeam) {
      editTeamForm.reset({
        name: editingTeam.name,
        description: editingTeam.description || "",
      });
    }
  }, [editingTeam, editTeamForm]);

  // Set form values when editing user
  useEffect(() => {
    if (editingUser) {
      editUserForm.reset({
        username: editingUser.username,
        email: editingUser.email,
        preferredName: editingUser.preferredName || "",
        teamId: editingUser.teamId,
      });
    }
  }, [editingUser, editUserForm]);

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (teamData: TeamFormData) => {
      return apiRequest("POST", "/api/teams", teamData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      createTeamForm.reset();
      toast({
        title: "Team created",
        description: "The team has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create team",
        variant: "destructive",
      });
    }
  });

  // Edit team mutation
  const editTeamMutation = useMutation({
    mutationFn: async (teamData: TeamFormData) => {
      if (!editingTeam) throw new Error("No team selected for editing");
      return apiRequest("PUT", `/api/teams/${editingTeam.id}`, teamData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setEditingTeam(null);
      toast({
        title: "Team updated",
        description: "The team has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update team",
        variant: "destructive",
      });
    }
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      return apiRequest("DELETE", `/api/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Team deleted",
        description: "The team has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete team",
        variant: "destructive",
      });
    }
  });

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      if (!editingUser) throw new Error("No user selected for editing");
      return apiRequest("PUT", `/api/users/${editingUser.id}`, userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      toast({
        title: "User updated",
        description: "The user has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "User deleted",
        description: "The user has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    }
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      return apiRequest("POST", `/api/users/${userId}/reset-password`, { password: newPassword });
    },
    onSuccess: () => {
      setResetPasswordOpen(false);
      setNewPassword("");
      setSelectedUserId(null);
      toast({
        title: "Password reset",
        description: "The user's password has been reset successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    }
  });

  // Form submit handlers
  const onCreateTeam = (data: TeamFormData) => {
    createTeamMutation.mutate(data);
  };

  const onEditTeam = (data: TeamFormData) => {
    editTeamMutation.mutate(data);
  };

  const onEditUser = (data: Partial<User>) => {
    editUserMutation.mutate(data);
  };

  useEffect(() => {
    if (users) {
      // Create a function to fetch individual user progress
      const fetchUserProgress = async (user: User) => {
        try {
          const response = await fetch(`/api/users/${user.id}/progress?tzOffset=${tzOffset}`);
          if (response.ok) {
            const progress = await response.json();
            setUserProgress(prev => ({
              ...prev,
              [user.id]: {
                week: progress.currentWeek,
                day: progress.currentDay,
                debug: progress.debug
              }
            }));
          }
        } catch (error) {
          console.error(`Error fetching progress for user ${user.id}:`, error);
        }
      };

      // Fetch progress for each user
      Promise.all(users.map(user => fetchUserProgress(user)))
        .catch(error => {
          console.error('Error fetching user progress data:', error);
        });
    }
  }, [users, tzOffset]);








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
    <AppLayout>
      <div className="min-h-screen bg-background">
        <main className="py-6 px-4">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                Manage teams and users
              </p>
            </div>

            {/* Teams Management Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold text-primary">Teams Management</CardTitle>
                <CardDescription>Create and manage teams</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Team</DialogTitle>
                      <DialogDescription>
                        Add a new team to the system
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...createTeamForm}>
                      <form onSubmit={createTeamForm.handleSubmit(onCreateTeam)} className="space-y-4">
                        <FormField
                          control={createTeamForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Team Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter team name" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createTeamForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Enter team description" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="submit" disabled={createTeamMutation.isPending}>
                            {createTeamMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Create Team
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>

                <div className="space-y-2">
                  {teamsLoading ? (
                    <p>Loading teams...</p>
                  ) : teams && teams.length > 0 ? (
                    teams.map((team) => (
                      <Card key={team.id} className="border-l-4 border-l-primary">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold text-lg">{team.name}</h3>
                              {team.description && (
                                <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary">
                                  {users?.filter(u => u.teamId === team.id).length || 0} members
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingTeam(team)}
                              >
                                Edit
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogTitle>Delete Team</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{team.name}"? This will remove all users from the team.
                                  </AlertDialogDescription>
                                  <div className="flex justify-end gap-2">
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteTeamMutation.mutate(team.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </div>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No teams created yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* User Management Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-bold text-primary">User Management</CardTitle>
                <CardDescription>Manage user accounts and assignments</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] w-full border rounded-md">
                  <div className="space-y-2 p-2">
                    {usersLoading ? (
                      <p>Loading users...</p>
                    ) : users && users.length > 0 ? (
                      users.map((currentUser) => (
                        <Collapsible key={currentUser.id} user={currentUser}>
                          <CollapsibleContent>
                            <div className="px-4 py-3 bg-gray-50 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-medium text-sm text-gray-700">User Details</h4>
                                  <p className="text-sm"><strong>Username:</strong> {currentUser.username}</p>
                                  <p className="text-sm"><strong>Email:</strong> {currentUser.email}</p>
                                  <p className="text-sm"><strong>Preferred Name:</strong> {currentUser.preferredName || 'Not set'}</p>
                                  <p className="text-sm"><strong>Points:</strong> {currentUser.points || 0}</p>
                                  <p className="text-sm">
                                    <strong>Admin:</strong> 
                                    <Badge variant={currentUser.isAdmin ? "destructive" : "secondary"} className="ml-2">
                                      {currentUser.isAdmin ? "Yes" : "No"}
                                    </Badge>
                                  </p>
                                  <p className="text-sm">
                                    <strong>Team Lead:</strong> 
                                    <Badge variant={currentUser.isTeamLead ? "default" : "secondary"} className="ml-2">
                                      {currentUser.isTeamLead ? "Yes" : "No"}
                                    </Badge>
                                  </p>
                                </div>
                                
                                <div>
                                  <h4 className="font-medium text-sm text-gray-700">Team Assignment</h4>
                                  <p className="text-sm">
                                    <strong>Current Team:</strong> {
                                      currentUser.teamId 
                                        ? teams?.find(t => t.id === currentUser.teamId)?.name || 'Unknown Team'
                                        : 'No team assigned'
                                    }
                                  </p>
                                  
                                  {userProgress[currentUser.id] && (
                                    <div className="mt-2">
                                      <p className="text-sm"><strong>Program Progress:</strong></p>
                                      <p className="text-xs text-muted-foreground">
                                        Week {userProgress[currentUser.id].week}, Day {userProgress[currentUser.id].day}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingUser(currentUser)}
                                >
                                  Edit User
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUserId(currentUser.id);
                                    setResetPasswordOpen(true);
                                  }}
                                >
                                  <Lock className="h-4 w-4 mr-1" />
                                  Reset Password
                                </Button>
                                
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      Delete User
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogTitle>Delete User</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {currentUser.username}? This action cannot be undone.
                                    </AlertDialogDescription>
                                    <div className="flex justify-end gap-2">
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteUserMutation.mutate(currentUser.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </div>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No users found.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Edit Team Dialog */}
        <Dialog open={!!editingTeam} onOpenChange={(open) => !open && setEditingTeam(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Team</DialogTitle>
              <DialogDescription>
                Update team information
              </DialogDescription>
            </DialogHeader>
            <Form {...editTeamForm}>
              <form onSubmit={editTeamForm.handleSubmit(onEditTeam)} className="space-y-4">
                <FormField
                  control={editTeamForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter team name" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editTeamForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter team description" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={editTeamMutation.isPending}>
                    {editTeamMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Update Team
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and team assignment
              </DialogDescription>
            </DialogHeader>
            <Form {...editUserForm}>
              <form onSubmit={editUserForm.handleSubmit(onEditUser)} className="space-y-4">
                <FormField
                  control={editUserForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter username" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editUserForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Enter email" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editUserForm.control}
                  name="preferredName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter preferred name (optional)" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editUserForm.control}
                  name="teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Assignment</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value ? parseInt(value) : null)} value={field.value?.toString() || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a team" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">No team assigned</SelectItem>
                          {teams?.map((team) => (
                            <SelectItem key={team.id} value={team.id.toString()}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={editUserMutation.isPending}>
                    {editUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Update User
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter a new password for the user
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label htmlFor="newPassword" className="text-sm font-medium">New Password</label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (selectedUserId && newPassword) {
                      resetPasswordMutation.mutate({ userId: selectedUserId, newPassword });
                    }
                  }}
                  disabled={resetPasswordMutation.isPending || !newPassword}
                >
                  {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Reset Password
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

          </div>
        </main>
      </div>
    </AppLayout>
  );
}