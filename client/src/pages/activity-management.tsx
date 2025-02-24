
import React from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ActivityManagementPage() {
  const { toast } = useToast();
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [workoutVideos, setWorkoutVideos] = useState<Array<{ url: string; description: string }>>([]);
  const [editingWorkoutVideos, setEditingWorkoutVideos] = useState<Array<{ url: string; description: string }>>([]);

  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

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

  const handleEditWorkoutVideo = (index: number, field: 'url' | 'description', value: string) => {
    const updatedVideos = [...editingWorkoutVideos];
    updatedVideos[index][field] = value;
    setEditingWorkoutVideos(updatedVideos);
  };

  const handleRemoveEditWorkoutVideo = (index: number) => {
    setEditingWorkoutVideos(editingWorkoutVideos.filter((_, i) => i !== index));
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
          <form onSubmit={async (e) => {
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
              workoutVideos
            };

            try {
              const res = await apiRequest("POST", "/api/activities", data);
              if (!res.ok) throw new Error('Failed to create activity');

              toast({
                title: "Success",
                description: "Activity created successfully"
              });

              queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
              setWorkoutVideos([]);
              (e.target as HTMLFormElement).reset();
            } catch (error) {
              toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create activity",
                variant: "destructive"
              });
            }
          }} className="space-y-4">
            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="week">Week</Label>
                <Input type="number" name="week" required min="1" />
              </div>
              <div>
                <Label htmlFor="day">Day</Label>
                <Input type="number" name="day" required min="1" max="7" />
              </div>
            </div>

            <div>
              <Label htmlFor="memoryVerse">Memory Verse</Label>
              <Textarea name="memoryVerse" required />
            </div>

            <div>
              <Label htmlFor="memoryVerseReference">Memory Verse Reference</Label>
              <Input name="memoryVerseReference" required />
            </div>

            <div>
              <Label htmlFor="scripture">Scripture Reading</Label>
              <Input name="scripture" />
            </div>

            <div>
              <Label htmlFor="tasks">Tasks</Label>
              <Textarea name="tasks" />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea name="description" />
            </div>

            <div>
              <Label htmlFor="workout">Workout</Label>
              <Textarea name="workout" />
            </div>

            <Button type="submit">Add Activity</Button>
          </form>

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
                {/* Edit form fields */}
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
