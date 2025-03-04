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
  const { user } = useAuth();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Get the current day number based on Monday start
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday (0) to 7

  // Calculate current week based on current day
  const currentWeek = Math.ceil(currentDay / 7);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [selectedDay, setSelectedDay] = useState(currentDay);

  const { data: activities } = useQuery({
    queryKey: ["/api/activities"],
  });

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

  const weeks = Array.from(new Set(activities?.map((a) => a.week) || [])).sort();
  const days = activities
    ?.filter((a) => a.week === selectedWeek)
    .map((a) => a.day)
    .sort() || [];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <ScrollArea className="h-[calc(100vh-80px)]">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold">Daily Activity</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {weeks.map((week) => (
            <Button
              key={week}
              variant={selectedWeek === week ? "default" : "outline"}
              onClick={() => setSelectedWeek(week)}
              disabled={week > Math.ceil(currentDay / 7)}
            >
              Week {week}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => (
            <Button
              key={day}
              variant={selectedDay === day ? "default" : "outline"}
              onClick={() => setSelectedDay(day)}
              disabled={selectedWeek * 7 + day > currentDay}
            >
              Day {day}
            </Button>
          ))}
        </div>

        {currentActivity ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Week {currentActivity.week} - Day {currentActivity.day}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                {currentActivity.contentFields?.map((field, index) => (
                  <div key={index} className="mb-8">
                    {field.title && <h2>{field.title}</h2>}
                    <div 
                      className="rich-text-content" 
                      dangerouslySetInnerHTML={{ __html: field.content }}
                    />
                  </div>
                ))}
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

      <style>{`
        .rich-text-content {
          line-height: 1.6;
        }
        .rich-text-content p {
          margin-bottom: 1em;
        }
        .rich-text-content h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 1em 0 0.5em;
        }
        .video-wrapper {
          position: relative;
          padding-bottom: 56.25%;
          height: 0;
          margin: 1rem 0;
        }
        .video-wrapper iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
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