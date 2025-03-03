
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema, insertActivitySchema } from "@shared/schema";
import type { Team, User, Activity, WorkoutVideo } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ChevronDown, PlusCircle, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

  const editTeamForm = useForm({
    resolver: zodResolver(insertTeamSchema),
  });

  const createActivityForm = useForm({
    resolver: zodResolver(insertActivitySchema),
  });

  const editActivityForm = useForm({
    resolver: zodResolver(insertActivitySchema),
  });

  const queryClient = useQueryClient();

  const createTeamMutation = useMutation({
    mutationFn: async (values: any) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to create team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Success", description: "Team created successfully" });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create team",
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Success", description: "Team updated successfully" });
      setEditTeamOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update team",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Success", description: "Team deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete team",
        variant: "destructive",
      });
    },
  });

  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number | null }) => {
      const res = await fetch(`/api/users/${userId}/team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) throw new Error("Failed to update user team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: "User team updated successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user team",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Password reset successfully" });
      setResetPasswordOpen(false);
      setNewPassword("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: "User deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create activity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Success", description: "Activity created successfully" });
      createActivityForm.reset();
      setWorkoutVideos([]);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create activity",
        variant: "destructive",
      });
    },
  });

  const updateActivityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update activity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Success", description: "Activity updated successfully" });
      setEditActivityOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update activity",
        variant: "destructive",
      });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/activities/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete activity");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Success", description: "Activity deleted successfully" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete activity",
        variant: "destructive",
      });
    },
  });

  const onCreateTeamSubmit = (values: any) => {
    createTeamMutation.mutate(values);
  };

  const onEditTeamSubmit = (values: any) => {
    if (editingTeam) {
      updateTeamMutation.mutate({ id: editingTeam.id, data: values });
    }
  };

  const onCreateActivitySubmit = (values: any) => {
    const data = {
      ...values,
      workoutVideos,
    };
    createActivityMutation.mutate(data);
  };

  const onEditActivitySubmit = (values: any) => {
    if (editingActivity) {
      const data = {
        ...values,
        workoutVideos: editingWorkoutVideos,
      };
      updateActivityMutation.mutate({ id: editingActivity.id, data });
    }
  };

  const handleResetPassword = () => {
    if (!selectedUserId || !newPassword) return;
    resetPasswordMutation.mutate({ userId: selectedUserId, password: newPassword });
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

      <main className="container max-w-screen-2xl pt-4">
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>
          
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                  <div className="space-y-4">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-lg border p-4 flex flex-col space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {u.preferredName || u.username} (#
                              {u.id}) {u.isAdmin && "(Admin)"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {u.email}
                            </p>
                          </div>
                          <Select
                            defaultValue={u.teamId?.toString() || ""}
                            onValueChange={(value) => {
                              updateUserTeamMutation.mutate({
                                userId: u.id,
                                teamId: value ? parseInt(value) : null,
                              });
                            }}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select team" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">No Team</SelectItem>
                              {teams.map((team) => (
                                <SelectItem
                                  key={team.id}
                                  value={team.id.toString()}
                                >
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center text-sm">
                          <span className="text-muted-foreground mr-2">
                            {u.weekInfo
                              ? `Week ${u.weekInfo.week}, Day ${u.weekInfo.day}`
                              : "Not started"}
                          </span>
                          {u.programStart && (
                            <span className="text-muted-foreground">
                              Start: {new Date(u.programStart).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(u.id);
                              setResetPasswordOpen(true);
                            }}
                          >
                            Reset Password
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/users/${u.id}/toggle-admin`, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ isAdmin: !u.isAdmin }),
                                });
                                
                                if (!res.ok) throw new Error("Failed to update admin status");
                                
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
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teams">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Teams</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Create Team</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Team</DialogTitle>
                      <DialogDescription>
                        Create a new team for users to join.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(onCreateTeamSubmit)}
                        className="space-y-4"
                      >
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Team name" {...field} />
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
                                <Textarea
                                  placeholder="Team description"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="submit">Create</Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                  <div className="space-y-4">
                    {teams.map((team) => (
                      <div
                        key={team.id}
                        className="rounded-lg border p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{team.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {team.description}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingTeam(team);
                                editTeamForm.setValue("name", team.name);
                                editTeamForm.setValue(
                                  "description",
                                  team.description
                                );
                                setEditTeamOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Are you sure you want to delete this team? All users will be removed from the team."
                                  )
                                ) {
                                  deleteTeamMutation.mutate(team.id);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1">Members</h4>
                          <div className="text-sm text-muted-foreground">
                            {users.filter((u) => u.teamId === team.id).length} members
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activities">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Activities</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Create Activity</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Create Activity</DialogTitle>
                      <DialogDescription>
                        Create a new daily activity for the program.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...createActivityForm}>
                      <form
                        onSubmit={createActivityForm.handleSubmit(onCreateActivitySubmit)}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={createActivityForm.control}
                            name="week"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Week</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    placeholder="Week number"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(parseInt(e.target.value))
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={createActivityForm.control}
                            name="day"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Day</FormLabel>
                                <FormControl>
                                  <Select
                                    onValueChange={(value) =>
                                      field.onChange(parseInt(value))
                                    }
                                    defaultValue={field.value?.toString()}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select day" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">Monday</SelectItem>
                                      <SelectItem value="2">Tuesday</SelectItem>
                                      <SelectItem value="3">Wednesday</SelectItem>
                                      <SelectItem value="4">Thursday</SelectItem>
                                      <SelectItem value="5">Friday</SelectItem>
                                      <SelectItem value="6">Saturday</SelectItem>
                                      <SelectItem value="7">Sunday</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={createActivityForm.control}
                          name="memoryVerse"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Memory Verse</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Memory verse"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createActivityForm.control}
                          name="memoryVerseReference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Memory Verse Reference</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="e.g. John 3:16"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createActivityForm.control}
                          name="scripture"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Scripture</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Scripture reading"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createActivityForm.control}
                          name="workout"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Workout</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Workout description"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <div>
                          <Label>Workout Videos</Label>
                          <div className="space-y-2 mt-2">
                            {workoutVideos.map((video, index) => (
                              <div key={index} className="flex space-x-2">
                                <Input
                                  placeholder="Video URL"
                                  value={video.url}
                                  onChange={(e) =>
                                    handleWorkoutVideoChange(
                                      index,
                                      "url",
                                      e.target.value
                                    )
                                  }
                                  className="flex-grow"
                                />
                                <Input
                                  placeholder="Description"
                                  value={video.description}
                                  onChange={(e) =>
                                    handleWorkoutVideoChange(
                                      index,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                  className="flex-grow"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => handleRemoveWorkoutVideo(index)}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleAddWorkoutVideo}
                              className="w-full"
                            >
                              <PlusCircle className="h-4 w-4 mr-2" />
                              Add Video
                            </Button>
                          </div>
                        </div>
                        
                        <FormField
                          control={createActivityForm.control}
                          name="tasks"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tasks</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Daily tasks"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={createActivityForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Activity description"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="submit">Create</Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                  <div className="space-y-4">
                    {isActivitiesError ? (
                      <div className="p-4 border border-red-300 bg-red-50 rounded-md">
                        <p className="text-red-500">Failed to load activities. Please try refreshing the page.</p>
                      </div>
                    ) : !activities ? (
                      <div className="flex justify-center p-4">
                        <Loader2 className="h-8 w-8 animate-spin" />
                      </div>
                    ) : (
                      activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-lg border p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                Week {activity.week}, Day {activity.day}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {activity.memoryVerseReference}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingActivity(activity);
                                  editActivityForm.setValue("week", activity.week);
                                  editActivityForm.setValue("day", activity.day);
                                  editActivityForm.setValue(
                                    "memoryVerse",
                                    activity.memoryVerse
                                  );
                                  editActivityForm.setValue(
                                    "memoryVerseReference",
                                    activity.memoryVerseReference
                                  );
                                  editActivityForm.setValue(
                                    "scripture",
                                    activity.scripture || ""
                                  );
                                  editActivityForm.setValue(
                                    "workout",
                                    activity.workout || ""
                                  );
                                  editActivityForm.setValue(
                                    "tasks",
                                    activity.tasks || ""
                                  );
                                  editActivityForm.setValue(
                                    "description",
                                    activity.description || ""
                                  );
                                  setEditingWorkoutVideos(
                                    Array.isArray(activity.workoutVideos)
                                      ? activity.workoutVideos.map((v) => ({
                                          url: v.url,
                                          description: v.description,
                                        }))
                                      : []
                                  );
                                  setEditActivityOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteActivity(activity.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                          <div className="border-t pt-2 mt-2">
                            <p className="text-sm font-medium">Memory Verse</p>
                            <p className="text-sm">{activity.memoryVerse}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for this user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleResetPassword}
              disabled={!newPassword}
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update team information.
            </DialogDescription>
          </DialogHeader>
          <Form {...editTeamForm}>
            <form
              onSubmit={editTeamForm.handleSubmit(onEditTeamSubmit)}
              className="space-y-4"
            >
              <FormField
                control={editTeamForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Team name" {...field} />
                    </FormControl>
                    <FormMessage />
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
                      <Textarea
                        placeholder="Team description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={editActivityOpen} onOpenChange={setEditActivityOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
            <DialogDescription>
              Update activity details.
            </DialogDescription>
          </DialogHeader>
          <Form {...editActivityForm}>
            <form
              onSubmit={editActivityForm.handleSubmit(onEditActivitySubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editActivityForm.control}
                  name="week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Week</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Week number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editActivityForm.control}
                  name="day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(parseInt(value))
                          }
                          defaultValue={field.value?.toString()}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Monday</SelectItem>
                            <SelectItem value="2">Tuesday</SelectItem>
                            <SelectItem value="3">Wednesday</SelectItem>
                            <SelectItem value="4">Thursday</SelectItem>
                            <SelectItem value="5">Friday</SelectItem>
                            <SelectItem value="6">Saturday</SelectItem>
                            <SelectItem value="7">Sunday</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editActivityForm.control}
                name="memoryVerse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory Verse</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Memory verse"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editActivityForm.control}
                name="memoryVerseReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory Verse Reference</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. John 3:16"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editActivityForm.control}
                name="scripture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scripture</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Scripture reading"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editActivityForm.control}
                name="workout"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workout</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Workout description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div>
                <Label>Workout Videos</Label>
                <div className="space-y-2 mt-2">
                  {editingWorkoutVideos.map((video, index) => (
                    <div key={index} className="flex space-x-2">
                      <Input
                        placeholder="Video URL"
                        value={video.url}
                        onChange={(e) =>
                          handleEditWorkoutVideo(
                            index,
                            "url",
                            e.target.value
                          )
                        }
                        className="flex-grow"
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
                        className="flex-grow"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemoveEditWorkoutVideo(index)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingWorkoutVideos([...editingWorkoutVideos, { url: '', description: '' }])}
                    className="w-full"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Video
                  </Button>
                </div>
              </div>
              
              <FormField
                control={editActivityForm.control}
                name="tasks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tasks</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Daily tasks"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editActivityForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Activity description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
