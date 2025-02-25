import React from 'react';
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Team, User, Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, UserPlus, Plus, Edit, Trash2, Video, X, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [workoutVideos, setWorkoutVideos] = useState<Array<{ url: string; description: string }>>([]);
  const [editingWorkoutVideos, setEditingWorkoutVideos] = useState<Array<{ url: string; description: string }>>([]);

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const form = useForm({
    resolver: zodResolver(insertTeamSchema),
  });

  const editTeamForm = useForm({
    resolver: zodResolver(insertTeamSchema),
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Team> }) => {
      const res = await apiRequest("PATCH", `/api/teams/${id}`, data);
      if (!res.ok) throw new Error("Failed to update team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setEditTeamOpen(false);
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
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
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: Team) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      form.reset();
      toast({
        title: "Success",
        description: "Team created successfully",
      });
    },
  });

  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/team`, { teamId });
      if (!res.ok) throw new Error("Failed to update user team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User team updated successfully" });
    },
  });

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    editTeamForm.reset({
      name: team.name,
      description: team.description,
    });
    setEditTeamOpen(true);
  };

  const handleDeleteTeam = (teamId: number) => {
    if (confirm("Are you sure you want to delete this team? All users in this team will be unassigned.")) {
      deleteTeamMutation.mutate(teamId);
    }
  };

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`, { password });
      if (!res.ok) throw new Error("Failed to reset password");
      toast({
        title: "Success",
        description: "Password has been reset successfully"
      });
      return { success: true };
    },
    onSuccess: () => {
      setResetPasswordOpen(false);
      setNewPassword("");
      setSelectedUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: "Success",
        description: "User password has been reset successfully"
      });
    },
    onError: (error) => {
      toast({ 
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive"
      });
    }
  });

  const handleResetPassword = (userId: number) => {
    setSelectedUserId(userId);
    setNewPassword("");
    setResetPasswordOpen(true);
  };

  const updateActivityMutation = useMutation({
    mutationFn: async (data: Partial<Activity>) => {
      const res = await apiRequest("PUT", `/api/activities/${editingActivity?.id}`, data);
      if (!res.ok) throw new Error("Failed to update activity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setEditActivityOpen(false);
      toast({
        title: "Success",
        description: "Activity updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: number) => {
      const res = await apiRequest("DELETE", `/api/activities/${activityId}`);
      if (!res.ok) throw new Error("Failed to delete activity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Success",
        description: "Activity deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setEditingWorkoutVideos(activity.workoutVideos || []);
    setEditActivityOpen(true);
  };

  const handleDeleteActivity = (activityId: number) => {
    if (confirm("Are you sure you want to delete this activity?")) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  const handleAddWorkoutVideo = () => {
    setWorkoutVideos([...workoutVideos, { url: '', description: '' }]);
  };

  const handleRemoveWorkoutVideo = (index: number) => {
    setWorkoutVideos(workoutVideos.filter((_, i) => i !== index));
  };

  const handleWorkoutVideoChange = (index: number, field: 'url' | 'description', value: string) => {
    const updatedVideos = [...workoutVideos];
    updatedVideos[index][field] = value;
    setWorkoutVideos(updatedVideos);
  };

  const handleEditWorkoutVideo = (index: number, field: 'url' | 'description', value: string) => {
    const updatedVideos = [...editingWorkoutVideos];
    updatedVideos[index][field] = value;
    setEditingWorkoutVideos(updatedVideos);
  };

  const handleRemoveEditWorkoutVideo = (index: number) => {
    setEditingWorkoutVideos(editingWorkoutVideos.filter((_, i) => i !== index));
  };


  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Not authorized</p>
      </div>
    );
  }

  if (!teams || !users || !activities) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <div className="flex gap-2 mt-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="w-28 px-2">
                <Plus className="h-3 w-3 mr-1" />
                New Team
              </Button>
            </DialogTrigger>
          </Dialog>
          <Button onClick={() => window.location.href = '/activity-management'} className="ml-2">
            Manage Activities
          </Button>
        </div>
              New Team
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby="new-team-description">
            <p id="new-team-description" className="sr-only">Create a new team form</p>
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
                        <Input {...field} />
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
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-2 pr-6 rounded hover:bg-accent"
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                  >
                    <p className="font-medium">{team.name}</p>
                    <p className="text-sm text-muted-foreground">{team.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditTeam(team)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteTeam(team.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {selectedTeam === team.id && (
                    <div className="w-2 h-2 rounded-full bg-primary ml-2" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between p-2 gap-2">
                  <div className="min-w-[150px]">
                    <p className="font-medium">{u.username}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Team: {teams.find((t) => t.id === u.teamId)?.name || "None"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedTeam) {
                          updateUserTeamMutation.mutate({ userId: u.id, teamId: selectedTeam });
                        }
                      }}
                      disabled={!selectedTeam || updateUserTeamMutation.isPending}
                    >
                      {updateUserTeamMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {u.teamId === selectedTeam ? "Already Assigned" : "Assign to Team"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetPassword(u.id)}
                    >
                      Reset Password
                    </Button>
                    <Button
                      variant={u.isAdmin ? "destructive" : "outline"}
                      size="sm"
                      onClick={async () => {
                        try {
                          await apiRequest("POST", `/api/users/${u.id}/toggle-admin`, {
                            isAdmin: !u.isAdmin
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                          toast({ 
                            title: "Success", 
                            description: `Admin status ${!u.isAdmin ? 'granted' : 'revoked'}`
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update admin status",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      {u.isAdmin ? "Remove Admin" : "Make Admin"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this user?")) {
                          deleteUserMutation.mutate(u.id);
                        }
                      }}
                    >
                      Delete User
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>



      <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
          </DialogHeader>
          <Form {...editTeamForm}>
            <form
              onSubmit={editTeamForm.handleSubmit(async (data) => {
                if (!editingTeam) return;
                try {
                  await updateTeamMutation.mutateAsync({ 
                    id: editingTeam.id, 
                    data: {
                      name: data.name,
                      description: data.description
                    }
                  });
                  setEditTeamOpen(false);
                } catch (error) {
                  console.error('Error in form submission:', error);
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={editTeamForm.control}
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
                control={editTeamForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateTeamMutation.isPending}>
                {updateTeamMutation.isPending ? "Updating..." : "Update Team"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button
            onClick={() => {
              if (selectedUserId) {
                resetPasswordMutation.mutate({
                  userId: selectedUserId,
                  password: newPassword,
                });
              }
            }}
            disabled={resetPasswordMutation.isPending || !newPassword}
          >
            {resetPasswordMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Reset Password
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={editActivityOpen} onOpenChange={setEditActivityOpen}>
        <DialogContent className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <Form>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = {
                  week: parseInt(formData.get('week') as string),
                  day: parseInt(formData.get('day') as string),
                  memoryVerse: formData.get('memoryVerse'),
                  memoryVerseReference: formData.get('memoryVerseReference'),
                  scripture: formData.get('scripture'),
                  workout: formData.get('workout'),
                  tasks: formData.get('tasks'),
                  description: formData.get('description'),
                  workoutVideos: editingWorkoutVideos
                };
                updateActivityMutation.mutate(data);
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="week">Week</Label>
                    <Input 
                      type="number" 
                      name="week" 
                      defaultValue={editingActivity?.week} 
                      required 
                      min="1" 
                    />
                  </div>
                  <div>
                    <Label htmlFor="day">Day</Label>
                    <Input 
                      type="number" 
                      name="day" 
                      defaultValue={editingActivity?.day} 
                      required 
                      min="1" 
                      max="7" 
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="memoryVerse">Memory Verse</Label>
                  <Textarea 
                    name="memoryVerse" 
                    defaultValue={editingActivity?.memoryVerse} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="memoryVerseReference">Memory Verse Reference</Label>
                  <Input 
                    name="memoryVerseReference" 
                    defaultValue={editingActivity?.memoryVerseReference} 
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="scripture">Scripture Reading</Label>
                  <Input 
                    name="scripture" 
                    defaultValue={editingActivity?.scripture} 
                  />
                </div>
                <div>
                  <Label htmlFor="tasks">Tasks</Label>
                  <Textarea 
                    name="tasks" 
                    defaultValue={editingActivity?.tasks} 
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    name="description" 
                    defaultValue={editingActivity?.description} 
                  />
                </div>
                <div>
                  <Label htmlFor="workout">Workout</Label>
                  <Textarea 
                    name="workout" 
                    defaultValue={editingActivity?.workout} 
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Workout Videos</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setEditingWorkoutVideos([...editingWorkoutVideos, { url: '', description: '' }])}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Video
                    </Button>
                  </div>

                  {editingWorkoutVideos.map((video, index) => (
                    <div key={index} className="space-y-2 p-4 border rounded-lg relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => handleRemoveEditWorkoutVideo(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>

                      <div>
                        <Label>Video Description</Label>
                        <Textarea
                          value={video.description}
                          onChange={(e) => handleEditWorkoutVideo(index, 'description', e.target.value)}
                          placeholder="Describe this workout video"
                        />
                      </div>

                      <div>
                        <Label>Video URL</Label>
                        <Input
                          value={video.url}
                          onChange={(e) => handleEditWorkoutVideo(index, 'url', e.target.value)}
                          placeholder="Enter video URL"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="submit" disabled={updateActivityMutation.isPending}>
                  {updateActivityMutation.isPending ? "Updating..." : "Update Activity"}
                </Button>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}