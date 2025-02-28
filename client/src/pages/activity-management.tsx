import React from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus, Video } from "lucide-react";
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

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      week: 1,
      day: 1,
      memoryVerse: "",
      memoryVerseReference: "",
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

  const updateActivityMutation = useMutation({
    mutationFn: async (data: ActivityFormValues & { workoutVideos: WorkoutVideo[] }) => {
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
    editForm.reset({
      week: activity.week,
      day: activity.day,
      memoryVerse: activity.memoryVerse,
      memoryVerseReference: activity.memoryVerseReference,
      scripture: activity.scripture,
      tasks: activity.tasks,
      description: activity.description,
      workout: activity.workout,
    });
    setEditActivityOpen(true);
  };

  const handleDeleteActivity = (activityId: number) => {
    if (confirm("Are you sure you want to delete this activity?")) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  const handleAddVideo = () => {
    if (editingActivity) {
      setEditingWorkoutVideos([...editingWorkoutVideos, newVideo]);
      setNewVideo({ url: '', description: '', title: '' });
      setAddVideoOpen(false);
    } else {
      setWorkoutVideos([...workoutVideos, newVideo]);
      setNewVideo({ url: '', description: '', title: '' });
      setAddVideoOpen(false);
    }
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Activity Management</h1>
        <Button variant="outline" onClick={() => window.history.back()}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(async (data) => {
              try {
                const activityData = {
                  ...data,
                  workoutVideos
                };

                const res = await apiRequest("POST", "/api/activities", activityData);
                if (!res.ok) throw new Error('Failed to create activity');

                toast({
                  title: "Success",
                  description: "Activity created successfully"
                });

                queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
                setWorkoutVideos([]);
                form.reset();
              } catch (error) {
                toast({
                  title: "Error",
                  description: error instanceof Error ? error.message : "Failed to create activity",
                  variant: "destructive"
                });
              }
            })} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Week</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} min={1} />
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
                        <Input type="number" {...field} min={1} max={7} />
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
                        value={field.value}
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
                        value={field.value}
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
                        value={field.value}
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

              <Button type="submit">Add Activity</Button>
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
                updateActivityMutation.mutate({
                  ...data,
                  workoutVideos: editingWorkoutVideos
                });
              })} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="week"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Week</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} min={1} />
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
                          <Input type="number" {...field} min={1} max={7} />
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
    </div>
  );
}