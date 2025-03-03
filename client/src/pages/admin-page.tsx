
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, Eye, EyeOff, Lock, Plus, Trash, User, UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-provider";
import { insertTeamSchema, Team, Activity } from "@/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { BottomNav } from "@/components/bottom-nav";

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

  const queryClient = useQueryClient();

  const createTeamMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create team');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/teams/${editingTeam?.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update team');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
      setEditTeamOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { userId: number, password: string }) => {
      const response = await fetch(`/api/users/${data.userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: data.password }),
      });
      if (!response.ok) throw new Error('Failed to reset password');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password reset successfully",
      });
      setResetPasswordOpen(false);
      setNewPassword("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const createActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          workoutVideos: data.workoutVideos ? JSON.stringify(data.workoutVideos) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to create activity');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Activity created successfully",
      });
      setWorkoutVideos([]);
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/activities/${editingActivity?.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          workoutVideos: data.workoutVideos ? JSON.stringify(data.workoutVideos) : null,
        }),
      });
      if (!response.ok) throw new Error('Failed to update activity');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Activity updated successfully",
      });
      setEditActivityOpen(false);
      setEditingActivity(null);
      setEditingWorkoutVideos([]);
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/activities/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete activity');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Activity deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/teams/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete team');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/teams'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (editingTeam) {
      editTeamForm.reset({
        name: editingTeam.name,
        description: editingTeam.description || undefined,
      });
    }
  }, [editingTeam, editTeamForm]);

  useEffect(() => {
    if (editingActivity && editingActivity.workoutVideos) {
      try {
        const parsedVideos = JSON.parse(editingActivity.workoutVideos);
        setEditingWorkoutVideos(Array.isArray(parsedVideos) ? parsedVideos : []);
      } catch (e) {
        setEditingWorkoutVideos([]);
      }
    } else {
      setEditingWorkoutVideos([]);
    }
  }, [editingActivity]);

  const handleResetPassword = () => {
    if (selectedUserId && newPassword) {
      resetPasswordMutation.mutate({ userId: selectedUserId, password: newPassword });
    }
  };

  const addWorkoutVideo = () => {
    setWorkoutVideos([...workoutVideos, { url: '', description: '' }]);
  };

  const updateWorkoutVideo = (index: number, field: 'url' | 'description', value: string) => {
    const updated = [...workoutVideos];
    updated[index][field] = value;
    setWorkoutVideos(updated);
  };

  const removeWorkoutVideo = (index: number) => {
    setWorkoutVideos(workoutVideos.filter((_, i) => i !== index));
  };

  const addEditingWorkoutVideo = () => {
    setEditingWorkoutVideos([...editingWorkoutVideos, { url: '', description: '' }]);
  };

  const updateEditingWorkoutVideo = (index: number, field: 'url' | 'description', value: string) => {
    const updated = [...editingWorkoutVideos];
    updated[index][field] = value;
    setEditingWorkoutVideos(updated);
  };

  const removeEditingWorkoutVideo = (index: number) => {
    setEditingWorkoutVideos(editingWorkoutVideos.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <ScrollArea className="h-[calc(100vh-80px)]">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          </div>
        </header>

        <main className="p-4 space-y-8">
          <div className="flex gap-2 mt-4 justify-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="default" className="px-4">
                  <Plus className="h-4 w-4 mr-2" />
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
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={createTeamMutation.isPending}>
                      {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button size="default" className="px-4">
                  <Plus className="h-4 w-4 mr-2" />
                  New Activity
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby="new-activity-description">
                <p id="new-activity-description" className="sr-only">Create a new activity form</p>
                <DialogHeader>
                  <DialogTitle>Create New Activity</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = {
                      week: Number(formData.get('week')),
                      day: Number(formData.get('day')),
                      memoryVerse: formData.get('memoryVerse') as string,
                      memoryVerseText: formData.get('memoryVerseText') as string,
                      devotional: formData.get('devotional') as string,
                      workout: formData.get('workout') as string,
                      nutritionTip: formData.get('nutritionTip') as string,
                      workoutVideos: workoutVideos.length > 0 ? workoutVideos : undefined,
                    };
                    createActivityMutation.mutate(data);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="week" className="block text-sm font-medium text-gray-700">Week</label>
                      <Input type="number" id="week" name="week" min="1" required />
                    </div>
                    <div>
                      <label htmlFor="day" className="block text-sm font-medium text-gray-700">Day</label>
                      <Input type="number" id="day" name="day" min="1" max="7" required />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="memoryVerse" className="block text-sm font-medium text-gray-700">Memory Verse Reference</label>
                    <Input id="memoryVerse" name="memoryVerse" required />
                  </div>
                  <div>
                    <label htmlFor="memoryVerseText" className="block text-sm font-medium text-gray-700">Memory Verse Text</label>
                    <Textarea id="memoryVerseText" name="memoryVerseText" rows={3} required />
                  </div>
                  <div>
                    <label htmlFor="devotional" className="block text-sm font-medium text-gray-700">Devotional</label>
                    <Textarea id="devotional" name="devotional" rows={5} required />
                  </div>
                  <div>
                    <label htmlFor="workout" className="block text-sm font-medium text-gray-700">Workout</label>
                    <Textarea id="workout" name="workout" rows={5} required />
                  </div>
                  <div>
                    <label htmlFor="nutritionTip" className="block text-sm font-medium text-gray-700">Nutrition Tip</label>
                    <Textarea id="nutritionTip" name="nutritionTip" rows={5} required />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-sm font-medium text-gray-700">Workout Videos</label>
                      <Button type="button" onClick={addWorkoutVideo} variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Add Video
                      </Button>
                    </div>
                    {workoutVideos.map((video, index) => (
                      <div key={index} className="grid gap-2 border p-3 rounded-md">
                        <div>
                          <label className="text-xs">URL</label>
                          <Input
                            value={video.url}
                            onChange={(e) => updateWorkoutVideo(index, 'url', e.target.value)}
                            placeholder="Video URL"
                          />
                        </div>
                        <div>
                          <label className="text-xs">Description</label>
                          <Input
                            value={video.description}
                            onChange={(e) => updateWorkoutVideo(index, 'description', e.target.value)}
                            placeholder="Video description"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={() => removeWorkoutVideo(index)}
                          variant="destructive"
                          size="sm"
                        >
                          <Trash className="h-4 w-4 mr-1" /> Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="submit" disabled={createActivityMutation.isPending}>
                    {createActivityMutation.isPending ? 'Creating...' : 'Create Activity'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="teams">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
            </TabsList>

            <TabsContent value="teams" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams?.map((team) => (
                  <div key={team.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-lg">{team.name}</h3>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingTeam(team);
                            setEditTeamOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this team?')) {
                              deleteTeamMutation.mutate(team.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{team.description}</p>
                    <div className="text-sm">
                      <span className="font-medium">Members: </span>
                      {users?.filter(u => u.teamId === team.id).length || 0}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users?.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{user.preferredName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {teams?.find(t => t.id === user.teamId)?.name || 'No Team'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.points}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.isAdmin ? 'Yes' : 'No'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setResetPasswordOpen(true);
                            }}
                          >
                            <Lock className="h-4 w-4 mr-1" />
                            Reset Password
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="activities" className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Week</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Day</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Memory Verse</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {activities?.map((activity) => (
                      <tr key={activity.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{activity.week}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{activity.day}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{activity.memoryVerse}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingActivity(activity);
                              setEditActivityOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this activity?')) {
                                deleteActivityMutation.mutate(activity.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </ScrollArea>

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
            handleResetPassword();
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
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
          </DialogHeader>
          <Form {...editTeamForm}>
            <form onSubmit={editTeamForm.handleSubmit((data) => updateTeamMutation.mutate(data))} className="space-y-4">
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
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateTeamMutation.isPending}>
                {updateTeamMutation.isPending ? 'Updating...' : 'Update Team'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={editActivityOpen} onOpenChange={setEditActivityOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          {editingActivity && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = {
                  week: Number(formData.get('week')),
                  day: Number(formData.get('day')),
                  memoryVerse: formData.get('memoryVerse') as string,
                  memoryVerseText: formData.get('memoryVerseText') as string,
                  devotional: formData.get('devotional') as string,
                  workout: formData.get('workout') as string,
                  nutritionTip: formData.get('nutritionTip') as string,
                  workoutVideos: editingWorkoutVideos.length > 0 ? editingWorkoutVideos : undefined,
                };
                updateActivityMutation.mutate(data);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="week" className="block text-sm font-medium text-gray-700">Week</label>
                  <Input type="number" id="week" name="week" min="1" defaultValue={editingActivity.week} required />
                </div>
                <div>
                  <label htmlFor="day" className="block text-sm font-medium text-gray-700">Day</label>
                  <Input type="number" id="day" name="day" min="1" max="7" defaultValue={editingActivity.day} required />
                </div>
              </div>
              <div>
                <label htmlFor="memoryVerse" className="block text-sm font-medium text-gray-700">Memory Verse Reference</label>
                <Input id="memoryVerse" name="memoryVerse" defaultValue={editingActivity.memoryVerse} required />
              </div>
              <div>
                <label htmlFor="memoryVerseText" className="block text-sm font-medium text-gray-700">Memory Verse Text</label>
                <Textarea id="memoryVerseText" name="memoryVerseText" rows={3} defaultValue={editingActivity.memoryVerseText} required />
              </div>
              <div>
                <label htmlFor="devotional" className="block text-sm font-medium text-gray-700">Devotional</label>
                <Textarea id="devotional" name="devotional" rows={5} defaultValue={editingActivity.devotional} required />
              </div>
              <div>
                <label htmlFor="workout" className="block text-sm font-medium text-gray-700">Workout</label>
                <Textarea id="workout" name="workout" rows={5} defaultValue={editingActivity.workout} required />
              </div>
              <div>
                <label htmlFor="nutritionTip" className="block text-sm font-medium text-gray-700">Nutrition Tip</label>
                <Textarea id="nutritionTip" name="nutritionTip" rows={5} defaultValue={editingActivity.nutritionTip} required />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-700">Workout Videos</label>
                  <Button type="button" onClick={addEditingWorkoutVideo} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Add Video
                  </Button>
                </div>
                {editingWorkoutVideos.map((video, index) => (
                  <div key={index} className="grid gap-2 border p-3 rounded-md">
                    <div>
                      <label className="text-xs">URL</label>
                      <Input
                        value={video.url}
                        onChange={(e) => updateEditingWorkoutVideo(index, 'url', e.target.value)}
                        placeholder="Video URL"
                      />
                    </div>
                    <div>
                      <label className="text-xs">Description</label>
                      <Input
                        value={video.description}
                        onChange={(e) => updateEditingWorkoutVideo(index, 'description', e.target.value)}
                        placeholder="Video description"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeEditingWorkoutVideo(index)}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash className="h-4 w-4 mr-1" /> Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="submit" disabled={updateActivityMutation.isPending}>
                {updateActivityMutation.isPending ? 'Updating...' : 'Update Activity'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      
      <BottomNav />
    </div>
  );
}
