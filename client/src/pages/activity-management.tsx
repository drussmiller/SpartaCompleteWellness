import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus, Video, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

interface WorkoutVideo {
  url: string;
  description: string;
  title: string;
}

const activityFormSchema = z.object({
  week: z.number().min(1),
  day: z.number().min(1).max(7),
  memoryVerseReference: z.string().min(1),
  memoryVerse: z.string().min(1),
  scripture: z.string().optional(),
  tasks: z.string().optional(),
  description: z.string().optional(),
  workout: z.string().optional(),
});

type ActivityFormValues = z.infer<typeof activityFormSchema>;

export default function ActivityManagementPage() {
  const { toast } = useToast();
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [workoutVideos, setWorkoutVideos] = useState<WorkoutVideo[]>([]);
  const [editingWorkoutVideos, setEditingWorkoutVideos] = useState<WorkoutVideo[]>([]);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [newVideo, setNewVideo] = useState<WorkoutVideo>({ url: '', description: '', title: '' });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<number | null>(null);


  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      week: 1,
      day: 1,
      memoryVerseReference: "",
      memoryVerse: "",
      scripture: "",
      tasks: "",
      description: "",
      workout: "",
    },
  });

  const editForm = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
  });

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const createActivityMutation = useMutation({
    mutationFn: async (values: ActivityFormValues) => {
      try {
        const data = {
          ...values,
          week: Number(values.week),
          day: Number(values.day),
          workoutVideos: workoutVideos.map(video => ({
            url: video.url,
            description: video.description,
            title: video.title
          }))
        };

        console.log('Creating activity with data:', data);
        const res = await apiRequest("POST", "/api/activities", data);

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Failed to create activity');
        }

        return res.json();
      } catch (error) {
        console.error('Activity creation error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setWorkoutVideos([]);
      form.reset();
      toast({
        title: "Success",
        description: "Activity created successfully"
      });
    },
    onError: (error: Error) => {
      console.error('Activity creation error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (values: ActivityFormValues) => {
      if (!editingActivity?.id) throw new Error("No activity selected for editing");

      try {
        const data = {
          ...values,
          week: Number(values.week),
          day: Number(values.day),
          workoutVideos: editingWorkoutVideos.map(video => ({
            url: video.url,
            description: video.description,
            title: video.title
          }))
        };

        console.log('Updating activity with data:', data);
        const res = await apiRequest("PUT", `/api/activities/${editingActivity.id}`, data);

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to update activity");
        }

        return res.json();
      } catch (error) {
        console.error('Activity update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setEditActivityOpen(false);
      toast({
        title: "Success",
        description: "Activity updated successfully"
      });
    },
    onError: (error: Error) => {
      console.error('Activity update error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: number) => {
      try {
        const res = await apiRequest("DELETE", `/api/activities/${activityId}`);
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to delete activity");
        }
        return res.json();
      } catch (error) {
        console.error('Activity deletion error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setDeleteDialogOpen(false);
      toast({
        title: "Success",
        description: "Activity deleted successfully"
      });
    },
    onError: (error: Error) => {
      console.error('Activity deletion error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setEditingWorkoutVideos(activity.workoutVideos || []);
    editForm.reset({
      week: activity.week,
      day: activity.day,
      memoryVerseReference: activity.memoryVerseReference || "",
      memoryVerse: activity.memoryVerse || "",
      scripture: activity.scripture || "",
      tasks: activity.tasks || "",
      description: activity.description || "",
      workout: activity.workout || "",
    });
    setEditActivityOpen(true);
  };

  const handleDeleteActivity = (activityId: number) => {
    setActivityToDelete(activityId);
    setDeleteDialogOpen(true);
  };

  const handleAddVideo = () => {
    if (editingActivity) {
      setEditingWorkoutVideos([...editingWorkoutVideos, newVideo]);
    } else {
      setWorkoutVideos([...workoutVideos, newVideo]);
    }
    setNewVideo({ url: '', description: '', title: '' });
    setAddVideoOpen(false);
  };

  const handleRemoveVideo = (index: number) => {
    if (editingActivity) {
      setEditingWorkoutVideos(editingWorkoutVideos.filter((_, i) => i !== index));
    } else {
      setWorkoutVideos(workoutVideos.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="h-screen w-full bg-background/95 p-6 shadow-lg animate-in slide-in-from-right">
      <div className="flex items-center justify-start mb-6"> {/* Changed justify to start */}
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="mr-2 h-10 w-10 bg-gray-200 hover:bg-gray-300 rounded-md flex items-center justify-center">
          <ChevronLeft className="h-9 w-9 text-black font-extrabold" />
        </Button>
        <h1 className="text-2xl font-bold ml-2">Activity Management</h1> {/* Adjusted margin */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => {
              console.log('Form data:', data);
              createActivityMutation.mutate(data);
            })} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Week</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          min={1} 
                          onChange={e => field.onChange(Number(e.target.value))} 
                          value={field.value || ''} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          min={1} 
                          max={7} 
                          onChange={e => field.onChange(Number(e.target.value))}
                          value={field.value || ''} 
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="memoryVerseReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory Verse Reference</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="memoryVerse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memory Verse</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scripture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scripture Reading</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tasks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tasks</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
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
                      <RichTextEditor
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="workout"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workout</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Workout Videos</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddVideoOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Video
                  </Button>
                </div>
                <div className="space-y-4">
                  {workoutVideos.map((video, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{video.title}</h4>
                        <p className="text-sm text-muted-foreground">{video.description}</p>
                        <p className="text-sm text-primary mt-1">{video.url}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveVideo(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit" disabled={createActivityMutation.isPending}>
                {createActivityMutation.isPending ? "Creating..." : "Add Activity"}
              </Button>
            </form>
          </Form>

          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Existing Activities</h3>
            <div className="space-y-4">
              {activities?.map((activity) => (
                <Card key={activity.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          Week {activity.week} - Day {activity.day}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {activity.memoryVerseReference}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditActivity(activity)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteActivity(activity.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editActivityOpen} onOpenChange={setEditActivityOpen}>
        <DialogContent className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => {
                console.log('Edit form data:', data);
                updateActivityMutation.mutate(data);
              })} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="week"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Week</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            min={1} 
                            onChange={e => field.onChange(Number(e.target.value))}
                            value={field.value || ''} 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="day"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Day</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            min={1} 
                            max={7} 
                            onChange={e => field.onChange(Number(e.target.value))}
                            value={field.value || ''} 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="memoryVerseReference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Memory Verse Reference</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="memoryVerse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Memory Verse</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="scripture"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scripture Reading</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="tasks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tasks</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="workout"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Label>Workout Videos</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddVideoOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Video
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {editingWorkoutVideos.map((video, index) => (
                      <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium">{video.title}</h4>
                          <p className="text-sm text-muted-foreground">{video.description}</p>
                          <p className="text-sm text-primary mt-1">{video.url}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveVideo(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type="submit" disabled={updateActivityMutation.isPending}>
                  {updateActivityMutation.isPending ? "Updating..." : "Update Activity"}
                </Button>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={addVideoOpen} onOpenChange={setAddVideoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Workout Video</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            handleAddVideo();
          }} className="space-y-4">
            <div>
              <Label htmlFor="videoTitle">Title</Label>
              <Input
                id="videoTitle"
                value={newVideo.title}
                onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="videoUrl">YouTube URL</Label>
              <Input
                id="videoUrl"
                value={newVideo.url}
                onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </div>
            <div>
              <Label htmlFor="videoDescription">Description</Label>
              <Input
                id="videoDescription"
                value={newVideo.description}
                onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                required
              />
            </div>
            <Button type="submit">Add Video</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <DialogContent>
            <p>Are you sure you want to delete this activity?</p>
          </DialogContent>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if(activityToDelete){
                deleteActivityMutation.mutate(activityToDelete);
              }
              setDeleteDialogOpen(false);
            }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}