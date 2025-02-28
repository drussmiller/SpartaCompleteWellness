import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
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

export default function ActivityPage() {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Get user info including weekInfo
  const { data: user } = useQuery({
    queryKey: ["/api/user"],
  });

  // Get activities based on user's current progress
  const { data: activities } = useQuery({
    queryKey: ["/api/activities"],
  });

  // Find current activity using weekInfo
  const currentActivity = activities?.find(
    (a) => a.week === user?.weekInfo?.week && a.day === user?.weekInfo?.day
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

  if (!user?.teamId) {
    return (
      <div className="max-w-2xl mx-auto pb-20">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4">
            <h1 className="text-xl font-bold">Daily Activity</h1>
          </div>
        </header>
        <main className="p-4">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Join a team to view daily activities
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!user.programStart) {
    return (
      <div className="max-w-2xl mx-auto pb-20">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4">
            <h1 className="text-xl font-bold">Daily Activity</h1>
          </div>
        </header>
        <main className="p-4">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Your program will start on the first Monday after joining your team
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <ScrollArea className="h-[calc(100vh-80px)]">
        <header className="sticky top-0 z-50 bg-background border-b border-border p-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold">Daily Activity</h1>
            <div className="text-sm text-muted-foreground">
              {user.weekInfo ? (
                <>
                  <div className="flex gap-2 mt-1 mb-1">
                    <div className="bg-muted px-2 py-1 rounded-md font-medium">Week {user.weekInfo.week}</div>
                    <div className="bg-muted px-2 py-1 rounded-md font-medium">Day {user.weekInfo.day}</div>
                  </div>
                  <span>Program started on {format(new Date(user.programStart), 'PPP')}</span>
                </>
              ) : (
                <div>Loading progress information...</div>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>
                    Today's Activity
                  </CardTitle>
                  {user?.weekInfo ? (
                    <div className="text-sm text-muted-foreground mt-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-muted px-2 py-0.5 rounded-md font-medium">Week {user.weekInfo.week}</span>
                        <span className="bg-muted px-2 py-0.5 rounded-md font-medium">Day {user.weekInfo.day}</span>
                      </div>
                      {user.programStart && (
                        <div>Program started on {format(new Date(user.programStart), 'MMM d, yyyy')}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground mt-1">
                      Loading progress information...
                    </div>
                  )}
                </div>
                {authUser?.isAdmin && (
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
              </div>
            </CardHeader>
            <CardContent>
              {currentActivity ? (
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
                        {currentActivity.workout.split('http').map((part, i) =>
                          i === 0 ? part : (
                            <React.Fragment key={i}>
                              <a
                                href={`http${part.split(/\s/)[0]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                http{part.split(/\s/)[0]}
                              </a>
                              {part.split(/\s/).slice(1).join(' ')}
                            </React.Fragment>
                          )
                        )}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  No activity found for Week {user.weekInfo?.week}, Day {user.weekInfo?.day}
                </div>
              )}
            </CardContent>
          </Card>
        </main>

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
      </ScrollArea>
      <BottomNav />
    </div>
  );
}