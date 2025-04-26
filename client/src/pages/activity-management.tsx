import React from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus, Loader2, Upload, ChevronLeft, FileText, Calendar, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppLayout } from "@/components/app-layout";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { YouTubePlayer } from "@/components/ui/youtube-player";

type ContentField = {
  id: string;
  type: 'text' | 'video';
  content: string;
  title: string;
};

export default function ActivityManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [contentFields, setContentFields] = useState<ContentField[]>([]);
  const [editingContentFields, setEditingContentFields] = useState<ContentField[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const isMobile = useIsMobile();

  const { data: activities, isLoading, error } = useQuery<Activity[]>({
    queryKey: ["/api/activities"]
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
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete activity");
      }
    },
    onMutate: async (deletedActivityId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/activities"] });

      // Snapshot the previous value
      const previousActivities = queryClient.getQueryData<Activity[]>(["/api/activities"]);

      // Optimistically update to the new value
      queryClient.setQueryData<Activity[]>(["/api/activities"], (old) =>
        old?.filter(activity => activity.id !== deletedActivityId) || []
      );

      // Return a context object with the snapshotted value
      return { previousActivities };
    },
    onError: (err, newActivity, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(["/api/activities"], context?.previousActivities);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete activity",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
      // Always refetch after error or success to make sure our optimistic update is correct
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Activity deleted successfully"
      });
    }
  });

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    setEditingContentFields(activity.contentFields || []);
    setEditActivityOpen(true);
  };

  const handleDeleteActivity = (activityId: number) => {
    setActivityToDelete(activityId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (activityToDelete) {
      deleteActivityMutation.mutate(activityToDelete);
    }
  };

  const addContentField = (type: 'text' | 'video') => {
    const newField: ContentField = {
      id: Math.random().toString(36).substring(7),
      type,
      content: '',
      title: ''
    };
    setContentFields([...contentFields, newField]);
  };

  const updateContentField = (id: string, field: keyof ContentField, value: string) => {
    setContentFields(contentFields.map(f =>
      f.id === id ? { ...f, [field]: value } : f
    ));
  };

  const removeContentField = (id: string) => {
    setContentFields(contentFields.filter(f => f.id !== id));
  };

  const addEditingContentField = (type: 'text' | 'video') => {
    const newField: ContentField = {
      id: Math.random().toString(36).substring(7),
      type,
      content: '',
      title: ''
    };
    setEditingContentFields([...editingContentFields, newField]);
  };

  const updateEditingContentField = (id: string, field: keyof ContentField, value: string) => {
    setEditingContentFields(editingContentFields.map(f =>
      f.id === id ? { ...f, [field]: value } : f
    ));
  };

  const removeEditingContentField = (id: string) => {
    setEditingContentFields(editingContentFields.filter(f => f.id !== id));
  };


  const handleWeekFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith('.docx')) {
      toast({
        title: "Invalid file",
        description: "Please upload a Word document (.docx)",
        variant: "destructive"
      });
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    try {
      const res = await fetch('/api/activities/upload-doc', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Failed to process document');
      }

      const data = await res.json();
      let title = file.name.replace('.docx', '');

      // Process YouTube links in the content
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
      let content = data.content;
      // Replace YouTube URLs with embedded iframe HTML
      const enhancedContent = content.replace(youtubeRegex, (match, videoId) => {
        return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      });

      // Create single rich text field with embedded videos
      const newFields: ContentField[] = [{
        id: Math.random().toString(36).substring(7),
        type: 'text',
        content: enhancedContent.trim(),
        title: title
      }];

      setContentFields(newFields);

      toast({
        title: "Success",
        description: "Document processed successfully"
      });
    } catch (error) {
      console.error('Error processing document:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process document",
        variant: "destructive"
      });
    }
  };

  const handleDailyFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.name.endsWith('.docx')) {
      toast({
        title: "Invalid file",
        description: "Please upload a Word document (.docx)",
        variant: "destructive"
      });
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    try {
      const res = await fetch('/api/activities/upload-doc', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Failed to process document');
      }

      const data = await res.json();
      let title = file.name.replace('.docx', '');

      // Process YouTube links in the content
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
      let content = data.content;
      // Replace YouTube URLs with embedded iframe HTML
      const enhancedContent = content.replace(youtubeRegex, (match, videoId) => {
        return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      });

      // Create single rich text field with embedded videos
      const newFields: ContentField[] = [{
        id: Math.random().toString(36).substring(7),
        type: 'text',
        content: enhancedContent.trim(),
        title: title
      }];

      setContentFields(newFields);

      toast({
        title: "Success",
        description: "Document processed successfully"
      });
    } catch (error) {
      console.error('Error processing document:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process document",
        variant: "destructive"
      });
    }
  };

  const handleWeekChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const week = parseInt(event.target.value);
    if (!isNaN(week) && week > 0) {
      setSelectedWeek(week);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading activities...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Activities</h2>
              <p className="text-gray-600">{error instanceof Error ? error.message : 'An error occurred'}</p>
              <Button
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/activities"] })}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Unauthorized</h2>
              <p className="text-gray-600">You do not have permission to manage activities.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen w-full bg-background/95 p-6 pb-24 shadow-lg animate-in slide-in-from-right">
          <div className="flex items-center mb-6">
            <Button
              variant="ghost"
              onClick={() => window.history.back()}
              className="p-2 mr-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
            >
              <ChevronLeft className="h-8 w-8" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-2xl font-bold">Activity Management</h1>
          </div>
          <div className="mb-8">
            <Label htmlFor="docUpload">Upload Word Document</Label>
            <div className="flex items-center gap-2">
              <Input
                id="docUpload"
                type="file"
                accept=".docx"
                onChange={async (event) => {
                  setContentFields([]);
                  const file = event.target.files?.[0];
                  if (file) {
                    await handleDailyFileUpload(event);
                  }
                }}
                className="flex-1"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a Word document to automatically create content with embedded videos
            </p>
          </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span>Week Information Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4 mb-4">
              <Label htmlFor="week-number" className="flex-shrink-0">Week Number</Label>
              <Input
                id="week-number"
                type="number"
                min="1"
                className="w-24"
                value={selectedWeek}
                onChange={handleWeekChange}
              />
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();

              // Format a title that includes "Week X" format for week content
              const weekTitle = `Week ${selectedWeek} Overview`;

              // Update content fields to include week number in title if they don't already
              const updatedContentFields = contentFields.map(field => ({
                ...field,
                title: field.title || weekTitle
              }));

              const data = {
                week: selectedWeek,
                day: 0, // Use day 0 to indicate week-only content
                contentFields: updatedContentFields
              };

              try {
                console.log('Submitting activity data:', data);
                const res = await apiRequest("POST", "/api/activities", data);
                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.message || 'Failed to create activity');
                }

                toast({
                  title: "Success",
                  description: `Week ${selectedWeek} information created successfully`
                });

                queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
                setContentFields([]);
                (e.target as HTMLFormElement).reset();
              } catch (error) {
                toast({
                  title: "Error",
                  description: error instanceof Error ? error.message : "Failed to create activity",
                  variant: "destructive"
                });
              }
            }} className="space-y-4">
              <div className="space-y-4">
                {contentFields.map((field) => (
                  <div key={field.id} className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label>{field.type === 'video' ? 'Video' : 'Text Content'}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContentField(field.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      type="text"
                      placeholder={`Week ${selectedWeek} ${field.type === 'video' ? 'Video' : 'Content'}`}
                      value={field.title}
                      onChange={(e) => updateContentField(field.id, 'title', e.target.value)}
                    />
                    {field.type === 'video' ? (
                      <div className="space-y-2">
                        <Input
                          type="text"
                          placeholder="YouTube Video URL"
                          value={field.content}
                          onChange={(e) => updateContentField(field.id, 'content', e.target.value)}
                        />
                        {field.content && (
                          <div className="mt-4 bg-black/5 rounded-md p-2">
                            <Label className="mb-2 block text-sm font-medium">Video Preview</Label>
                            <YouTubePlayer videoId={field.content} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <RichTextEditor
                        content={field.content}
                        onChange={(newContent) => updateContentField(field.id, 'content', newContent)}
                      />
                    )}
                  </div>
                ))}
              </div>


              <Button type="submit" className="bg-violet-700 text-white hover:bg-violet-800">
                Add Week Information
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span>Daily Activity Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target as HTMLFormElement);
              const data = {
                week: parseInt(formData.get('week') as string),
                day: parseInt(formData.get('day') as string),
                contentFields
              };

              try {
                console.log('Submitting activity data:', data);
                const res = await apiRequest("POST", "/api/activities", data);
                if (!res.ok) {
                  const errorData = await res.json();
                  throw new Error(errorData.message || 'Failed to create activity');
                }

                toast({
                  title: "Success",
                  description: "Activity created successfully"
                });

                queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
                setContentFields([]);
                (e.target as HTMLFormElement).reset();
              } catch (error) {
                toast({
                  title: "Error",
                  description: error instanceof Error ? error.message : "Failed to create activity",
                  variant: "destructive"
                });
              }
            }} className="space-y-4">
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

              <div className="space-y-4">
                {contentFields.map((field) => (
                  <div key={field.id} className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label>{field.type === 'video' ? 'Video' : 'Text Content'}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContentField(field.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      type="text"
                      placeholder="Title"
                      value={field.title}
                      onChange={(e) => updateContentField(field.id, 'title', e.target.value)}
                    />
                    {field.type === 'video' ? (
                      <div className="space-y-2">
                        <Input
                          type="text"
                          placeholder="YouTube Video URL"
                          value={field.content}
                          onChange={(e) => updateContentField(field.id, 'content', e.target.value)}
                        />
                        {field.content && (
                          <div className="mt-4 bg-black/5 rounded-md p-2">
                            <Label className="mb-2 block text-sm font-medium">Video Preview</Label>
                            <YouTubePlayer videoId={field.content} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <RichTextEditor
                        content={field.content}
                        onChange={(newContent) => updateContentField(field.id, 'content', newContent)}
                      />
                    )}
                  </div>
                ))}
              </div>

              <Button type="submit" className="bg-violet-700 text-white hover:bg-violet-800">Add Activity</Button>
            </form>

            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Existing Activities</h3>
              <div className="space-y-4 mb-20">
                {activities
                  ?.slice()
                  .sort((a, b) => a.week !== b.week ? a.week - b.week : a.day - b.day)
                  .map((activity) => (
                    <Card key={activity.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {activity.day === 0
                                ? `Week ${activity.week} Information`
                                : `Week ${activity.week} - Day ${activity.day}`}
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
            <ScrollArea className="max-h-[70vh] pr-4 mb-20">
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = {
                  week: parseInt(formData.get('week') as string),
                  day: parseInt(formData.get('day') as string),
                  contentFields: editingContentFields
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
                      min="0" // Allow 0 for week-only information
                      max="7"
                    />
                    {editingActivity?.day === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Day 0 indicates week-only information
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {editingContentFields.map((field) => (
                    <div key={field.id} className="space-y-2 p-4 border rounded-lg">
                      <div className="flex justify-between items-center">
                        <Label>{field.type === 'video' ? 'Video' : 'Text Content'}</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEditingContentField(field.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        type="text"
                        placeholder="Title"
                        value={field.title}
                        onChange={(e) => updateEditingContentField(field.id, 'title', e.target.value)}
                      />
                      {field.type === 'video' ? (
                        <div className="space-y-2">
                          <Input
                            type="text"
                            placeholder="YouTube Video URL"
                            value={field.content}
                            onChange={(e) => updateEditingContentField(field.id, 'content', e.target.value)}
                          />
                          {field.content && (
                            <div className="mt-4 bg-black/5 rounded-md p-2">
                              <Label className="mb-2 block text-sm font-medium">Video Preview</Label>
                              <YouTubePlayer videoId={field.content} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <RichTextEditor
                          content={field.content}
                          onChange={(newContent) => updateEditingContentField(field.id, 'content', newContent)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <Button type="submit" disabled={updateActivityMutation.isPending}>
                  {updateActivityMutation.isPending ? "Updating..." : "Update Activity"}
                </Button>
              </form>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteDialogOpen(false);
              setActivityToDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Activity</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this activity? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setActivityToDelete(null);
                }}
                disabled={deleteActivityMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteActivityMutation.isPending}
              >
                {deleteActivityMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Activity"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}