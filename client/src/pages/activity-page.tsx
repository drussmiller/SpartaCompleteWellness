import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Activity } from "@shared/schema";

export default function ActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Get user's current week and day info
  const { data: weekInfo } = useQuery({
    queryKey: ["/api/activities/current"],
    enabled: !!user?.teamId
  });

  if (!user?.teamId) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Join a team to start your program
          </CardContent>
        </Card>
      </div>
    );
  }

  // If weekInfo is null, the program hasn't started yet
  if (!weekInfo) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Your program will start on the first Monday after joining a team
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get all activities
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  // Set selected week/day based on user's current program progress
  const [selectedWeek, setSelectedWeek] = useState(weekInfo?.currentWeek || 1);
  const [selectedDay, setSelectedDay] = useState(weekInfo?.currentDay || 1);

  // Update selected week/day when weekInfo changes
  React.useEffect(() => {
    if (weekInfo) {
      setSelectedWeek(weekInfo.currentWeek);
      setSelectedDay(weekInfo.currentDay);
    }
  }, [weekInfo]);

  const currentActivity = activities?.find(
    (a) => a.week === selectedWeek && a.day === selectedDay
  );

  const form = useForm();

  const updateActivityMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/activities/${currentActivity?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Activity updated successfully"
      });
    }
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/activities/${currentActivity?.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Success",
        description: "Activity deleted successfully"
      });
    }
  });


  return (
    <div className="max-w-2xl mx-auto pb-20">
      <ScrollArea className="h-[calc(100vh-80px)]">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4">
            <h1 className="text-xl font-bold">Daily Activity</h1>
            {weekInfo?.isSpartan && (
              <div className="mt-1 text-sm font-medium text-primary">
                Spartan Status Achieved! 🏆
              </div>
            )}
          </div>
        </header>

        <main className="p-4 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[...Array(12)].map((_, i) => (
              <Button
                key={i + 1}
                variant={selectedWeek === i + 1 ? "default" : "outline"}
                onClick={() => setSelectedWeek(i + 1)}
                disabled={i + 1 > weekInfo.currentWeek}
              >
                Week {i + 1}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {[...Array(7)].map((_, i) => (
              <Button
                key={i + 1}
                variant={selectedDay === i + 1 ? "default" : "outline"}
                onClick={() => setSelectedDay(i + 1)}
                disabled={
                  selectedWeek === weekInfo.currentWeek &&
                  i + 1 > weekInfo.currentDay
                }
              >
                {i === 0 ? "Monday" :
                 i === 1 ? "Tuesday" :
                 i === 2 ? "Wednesday" :
                 i === 3 ? "Thursday" :
                 i === 4 ? "Friday" :
                 i === 5 ? "Saturday" :
                 "Sunday"}
              </Button>
            ))}
          </div>

          {currentActivity ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  Week {currentActivity.week} - Day {currentActivity.day}
                </CardTitle>
                {user?.isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-gray-400 hover:bg-gray-500 text-black font-bold"
                      onClick={() => {
                        form.reset(currentActivity);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="bg-gray-400 hover:bg-gray-500 text-black font-bold"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this activity?")) {
                          deleteActivityMutation.mutate();
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <h2>Memory Verse</h2>
                  <blockquote>
                    {currentActivity.memoryVerseReference} - "{currentActivity.memoryVerse}"
                  </blockquote>

                  {currentActivity.scripture && (
                    <>
                      <h2>Scripture Reading</h2>
                      <p>{currentActivity.scripture}</p>
                    </>
                  )}

                  {currentActivity.tasks && (
                    <>
                      <h2>Tasks</h2>
                      <div dangerouslySetInnerHTML={{ __html: currentActivity.tasks }} />
                    </>
                  )}

                  {currentActivity.description && (
                    <>
                      <h2>Description</h2>
                      <p className="whitespace-pre-line">
                        {currentActivity.description}
                      </p>
                    </>
                  )}

                  {currentActivity.workout && (
                    <>
                      <h2>Workout</h2>
                      {currentActivity.workoutVideos && currentActivity.workoutVideos.length > 0 && (
                        <div className="space-y-4 mb-4">
                          {currentActivity.workoutVideos.map((video, index) => (
                            <div key={index} className="space-y-2">
                              <p className="font-medium">{video.description}</p>
                              <div className="aspect-video">
                                <iframe
                                  className="w-full h-full"
                                  src={`https://www.youtube.com/embed/${video.url.split(/[/?]/)[3]}`}
                                  title="Workout Video"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-line">
                        {currentActivity.workout}
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No activity found for this day
              </CardContent>
            </Card>
          )}
        </main>
      </ScrollArea>
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Activity</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => updateActivityMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="memoryVerse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Memory Verse</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
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
                  name="workout"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="workoutVideo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout Video URL</FormLabel>
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
                <Button type="submit" disabled={updateActivityMutation.isPending}>
                  {updateActivityMutation.isPending ? "Updating..." : "Update Activity"}
                </Button>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <BottomNav />
    </div>
  );
}