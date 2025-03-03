import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema, insertActivitySchema } from "@shared/schema";
import type { Team, User, Activity, WorkoutVideo } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ChevronDown, PlusCircle, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


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

  const { data: activities, error: activitiesError, isError: isActivitiesError } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    onError: (error) => {
      console.error("Error fetching activities:", error);
      toast({
        title: "Error",
        description: "Failed to load activities",
        variant: "destructive",
      });
    }
  });

  const form = useForm({
    resolver: zodResolver(insertTeamSchema),
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; description: string }) => {
      return await apiRequest(`/api/teams/${data.id}`, {
        method: "PATCH",
        data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Team updated",
        description: "The team has been updated successfully",
      });
      setEditTeamOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update team",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      return await apiRequest(`/api/teams/${teamId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Team deleted",
        description: "The team has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete team",
        variant: "destructive",
      });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertTeamSchema>) => {
      return await apiRequest("/api/teams", {
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: "Team created",
        description: "The team has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create team",
        variant: "destructive",
      });
    },
  });

  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number | null }) => {
      return await apiRequest(`/api/users/${userId}/team`, {
        method: "POST",
        data: { teamId },
      });
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "User team has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update user team",
        variant: "destructive",
      });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: number; isAdmin: boolean }) => {
      return await apiRequest(`/api/users/${userId}/toggle-admin`, {
        method: "POST",
        data: { isAdmin },
      });
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "User admin status has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update user admin status",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      return await apiRequest(`/api/users/${userId}/reset-password`, {
        method: "POST",
        data: { password },
      });
    },
    onSuccess: () => {
      setResetPasswordOpen(false);
      setNewPassword("");
      toast({
        title: "Password reset",
        description: "User password has been reset successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to reset user password",
        variant: "destructive",
      });
    },
  });

  const activityForm = useForm({
    resolver: zodResolver(insertActivitySchema),
  });

  const createActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/activities", {
        method: "POST",
        data,
      });
    },
    onSuccess: () => {
      activityForm.reset();
      setWorkoutVideos([]);
      toast({
        title: "Activity created",
        description: "The activity has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create activity",
        variant: "destructive",
      });
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest(`/api/activities/${data.id}`, {
        method: "PUT",
        data,
      });
    },
    onSuccess: () => {
      setEditActivityOpen(false);
      toast({
        title: "Activity updated",
        description: "The activity has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update activity",
        variant: "destructive",
      });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/activities/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Activity deleted",
        description: "The activity has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete activity",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: z.infer<typeof insertTeamSchema>) => {
    createTeamMutation.mutate(data);
  };

  const handleCreateActivity = (data: any) => {
    const activityData = { ...data, workoutVideos };
    createActivityMutation.mutate(activityData);
  };

  const handleUpdateActivity = () => {
    if (!editingActivity) return;

    const activityData = {
      ...editingActivity,
      workoutVideos: editingWorkoutVideos
    };

    updateActivityMutation.mutate(activityData);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setEditingWorkoutVideos(Array.isArray(activity.workoutVideos) ? activity.workoutVideos : []);
    setEditActivityOpen(true);
  };

  const handleAddWorkoutVideo = () => {
    setWorkoutVideos([...workoutVideos, { url: "", description: "" }]);
  };

  const handleUpdateWorkoutVideo = (index: number, field: 'url' | 'description', value: string) => {
    const updatedVideos = [...workoutVideos];
    updatedVideos[index][field] = value;
    setWorkoutVideos(updatedVideos);
  };

  const handleRemoveWorkoutVideo = (index: number) => {
    setWorkoutVideos(workoutVideos.filter((_, i) => i !== index));
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setEditTeamOpen(true);
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

  if (!teams || !users) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
        </div>
      </header>

      <main className="container mx-auto py-6 max-w-screen-2xl">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Manage Users</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {users.map((user) => (
                      <Card key={user.id} className="overflow-hidden">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar>
                              {user.imageUrl ? (
                                <AvatarImage src={user.imageUrl} alt={user.username} />
                              ) : (
                                <AvatarFallback>
                                  {user.username.charAt(0)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div>
                              <h3 className="text-lg font-semibold">
                                {user.preferredName || user.username}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                @{user.username}
                              </p>
                            </div>
                          </div>
                          <div className="text-sm space-y-1">
                            <div>
                              <span className="font-medium">Email:</span> {user.email}
                            </div>
                            <div>
                              <span className="font-medium">Team:</span>{" "}
                              {user.teamId
                                ? teams.find((t) => t.id === user.teamId)?.name || "Unknown"
                                : "None"}
                            </div>
                            <div>
                              <span className="font-medium">Week:</span>{" "}
                              {user.weekInfo?.week || "Not started"}
                            </div>
                            <div>
                              <span className="font-medium">Role:</span>{" "}
                              {user.isAdmin ? "Admin" : "User"}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Select
                                value={user.teamId?.toString() || ""}
                                onValueChange={(value) => {
                                  updateUserTeamMutation.mutate({
                                    userId: user.id,
                                    teamId: value ? parseInt(value) : null,
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">No Team</SelectItem>
                                  {teams.map((team) => (
                                    <SelectItem key={team.id} value={team.id.toString()}>
                                      {team.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  setResetPasswordOpen(true);
                                }}
                              >
                                Reset Password
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant={user.isAdmin ? "destructive" : "outline"}
                                onClick={() => {
                                  toggleAdminMutation.mutate({
                                    userId: user.id,
                                    isAdmin: !user.isAdmin,
                                  });
                                }}
                              >
                                {user.isAdmin ? "Remove Admin" : "Make Admin"}
                              </Button>

                              <Button variant="destructive" disabled>
                                Delete User
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams" className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Create Team</CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Name</FormLabel>
                            <FormControl>
                              <Input placeholder="team-name" {...field} />
                            </FormControl>
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
                        {createTeamMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Create Team
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Manage Teams</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                    <div className="space-y-4">
                      {teams.map((team) => (
                        <Card key={team.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-center">
                              <CardTitle>{team.name}</CardTitle>
                              <div className="flex space-x-2">
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
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete ${team.name}?`)) {
                                      deleteTeamMutation.mutate(team.id);
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              {team.description || "No description"}
                            </p>
                            <div className="mt-2">
                              <p className="text-sm font-medium">Members:</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {users.filter((u) => u.teamId === team.id).length === 0 && (
                                  <p className="text-sm text-muted-foreground">No members</p>
                                )}
                                {users
                                  .filter((u) => u.teamId === team.id)
                                  .map((user) => (
                                    <div
                                      key={user.id}
                                      className="flex items-center bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs"
                                    >
                                      {user.preferredName || user.username}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activities" className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Create Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...activityForm}>
                    <form
                      onSubmit={activityForm.handleSubmit(handleCreateActivity)}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={activityForm.control}
                          name="week"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Week</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="1"
                                  min="1"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={activityForm.control}
                          name="day"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Day</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="1"
                                  min="1"
                                  max="7"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={activityForm.control}
                        name="memoryVerse"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Memory Verse</FormLabel>
                            <FormControl>
                              <Input placeholder="Verse text" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={activityForm.control}
                        name="memoryVerseReference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Verse Reference</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. John 3:16" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={activityForm.control}
                        name="scripture"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Scripture</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Scripture text" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={activityForm.control}
                        name="workout"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Workout</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Workout description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div>
                        <Label>Workout Videos</Label>
                        <div className="space-y-2 mt-2">
                          {workoutVideos.map((video, index) => (
                            <div key={index} className="space-y-2 p-2 border rounded-md">
                              <div className="flex justify-between items-center">
                                <Label>Video {index + 1}</Label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveWorkoutVideo(index)}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                              <Input
                                placeholder="Video URL"
                                value={video.url}
                                onChange={(e) =>
                                  handleUpdateWorkoutVideo(index, "url", e.target.value)
                                }
                              />
                              <Input
                                placeholder="Description"
                                value={video.description}
                                onChange={(e) =>
                                  handleUpdateWorkoutVideo(
                                    index,
                                    "description",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddWorkoutVideo}
                            className="mt-2"
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Add Video
                          </Button>
                        </div>
                      </div>

                      <FormField
                        control={activityForm.control}
                        name="tasks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tasks</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Daily tasks" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={activityForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Activity description" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={createActivityMutation.isPending}
                      >
                        {createActivityMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Create Activity
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Manage Activities</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                    {activities && activities.length > 0 ? (
                      <div className="space-y-4">
                        {activities
                          .sort((a, b) => a.week - b.week || a.day - b.day)
                          .map((activity) => (
                            <Card key={activity.id}>
                              <CardHeader className="pb-2">
                                <div className="flex justify-between items-center">
                                  <CardTitle>
                                    Week {activity.week}, Day {activity.day}
                                  </CardTitle>
                                  <div className="flex space-x-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditActivity(activity)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            `Are you sure you want to delete this activity?`
                                          )
                                        ) {
                                          deleteActivityMutation.mutate(activity.id);
                                        }
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <h3 className="font-semibold">Memory Verse</h3>
                                    <p className="text-sm">
                                      {activity.memoryVerse || "None"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {activity.memoryVerseReference}
                                    </p>
                                  </div>
                                  <div>
                                    <h3 className="font-semibold">Workout</h3>
                                    <p className="text-sm">{activity.workout || "None"}</p>
                                    {activity.workoutVideos && 
                                    Array.isArray(activity.workoutVideos) && 
                                    activity.workoutVideos.length > 0 && (
                                      <div className="mt-1">
                                        <p className="text-xs font-medium">Videos:</p>
                                        <ul className="text-xs list-disc pl-4">
                                          {activity.workoutVideos.map((video, idx) => (
                                            <li key={idx}>
                                              {video.description || video.url}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center p-4">
                        {isActivitiesError ? (
                          <p>Error loading activities</p>
                        ) : (
                          <p>No activities found</p>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedUserId && newPassword) {
                  resetPasswordMutation.mutate({
                    userId: selectedUserId,
                    password: newPassword,
                  });
                }
              }}
              disabled={!newPassword || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
          </DialogHeader>
          {editingTeam && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-team-name">Team Name</Label>
                <Input
                  id="edit-team-name"
                  value={editingTeam.name}
                  onChange={(e) =>
                    setEditingTeam({ ...editingTeam, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-team-description">Description</Label>
                <Input
                  id="edit-team-description"
                  value={editingTeam.description || ""}
                  onChange={(e) =>
                    setEditingTeam({
                      ...editingTeam,
                      description: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                if (editingTeam) {
                  updateTeamMutation.mutate({
                    id: editingTeam.id,
                    name: editingTeam.name,
                    description: editingTeam.description || "",
                  });
                }
              }}
              disabled={updateTeamMutation.isPending}
            >
              {updateTeamMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog */}
      <Dialog open={editActivityOpen} onOpenChange={setEditActivityOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          {editingActivity && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 py-4 pr-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-week">Week</Label>
                    <Input
                      id="edit-week"
                      type="number"
                      min="1"
                      value={editingActivity.week}
                      onChange={(e) =>
                        setEditingActivity({
                          ...editingActivity,
                          week: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-day">Day</Label>
                    <Input
                      id="edit-day"
                      type="number"
                      min="1"
                      max="7"
                      value={editingActivity.day}
                      onChange={(e) =>
                        setEditingActivity({
                          ...editingActivity,
                          day: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-memory-verse">Memory Verse</Label>
                  <Input
                    id="edit-memory-verse"
                    value={editingActivity.memoryVerse || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        memoryVerse: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-verse-reference">Verse Reference</Label>
                  <Input
                    id="edit-verse-reference"
                    value={editingActivity.memoryVerseReference || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        memoryVerseReference: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-scripture">Scripture</Label>
                  <Textarea
                    id="edit-scripture"
                    value={editingActivity.scripture || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        scripture: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-workout">Workout</Label>
                  <Textarea
                    id="edit-workout"
                    value={editingActivity.workout || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        workout: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Workout Videos</Label>
                  <div className="space-y-2 mt-2">
                    {editingWorkoutVideos.map((video, index) => (
                      <div key={index} className="space-y-2 p-2 border rounded-md">
                        <div className="flex justify-between items-center">
                          <Label>Video {index + 1}</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEditWorkoutVideo(index)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          placeholder="Video URL"
                          value={video.url}
                          onChange={(e) =>
                            handleEditWorkoutVideo(index, "url", e.target.value)
                          }
                        />
                        <Input
                          placeholder="Description"
                          value={video.description}
                          onChange={(e) =>
                            handleEditWorkoutVideo(
                              index,
                              "description",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingWorkoutVideos([...editingWorkoutVideos, { url: "", description: "" }])}
                      className="mt-2"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Add Video
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-tasks">Tasks</Label>
                  <Textarea
                    id="edit-tasks"
                    value={editingActivity.tasks || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        tasks: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editingActivity.description || ""}
                    onChange={(e) =>
                      setEditingActivity({
                        ...editingActivity,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button
              onClick={handleUpdateActivity}
              disabled={updateActivityMutation.isPending}
            >
              {updateActivityMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}