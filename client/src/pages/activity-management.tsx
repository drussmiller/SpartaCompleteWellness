import React from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus, Loader2, Upload, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { RichTextEditor } from "@/components/rich-text-editor";
// Added imports for mobile navigation
import { useIsMobile } from "@/hooks/use-mobile"; // Correct import path
import BottomNav from "@/components/bottom-nav"; // Placeholder import


type ContentField = {
  id: string;
  type: 'text' | 'video';
  content: string;
  title: string;
};

export default function ActivityManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [contentFields, setContentFields] = useState<ContentField[]>([]);
  const [editingContentFields, setEditingContentFields] = useState<ContentField[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<number | null>(null);
  const isMobile = useIsMobile(); // Use the isMobile hook

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      // Clean up states
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
      toast({
        title: "Success",
        description: "Activity deleted successfully"
      });
    },
    onError: (error: Error) => {
      console.error('Error deleting activity:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete activity",
        variant: "destructive"
      });
      // Clean up states even on error
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
    },
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
      try {
        deleteActivityMutation.mutate(activityToDelete);
      } catch (error) {
        console.error('Error in delete handler:', error);
      }
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      console.log('Uploading document:', file.name);
      const res = await fetch('/api/activities/upload-doc', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Failed to process document');
      }

      const data = await res.json();
      console.log('Processed document content:', data.content);

      const newField = {
        id: Math.random().toString(36).substring(7),
        type: 'text',
        content: data.content,
        title: file.name.replace('.docx', '')
      };

      setContentFields([newField]);

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


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading activities...</span>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-red-500 mb-2">Unauthorized</h2>
            <p className="text-gray-600">You do not have permission to manage activities.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background/95 p-6 pb-24 shadow-lg animate-in slide-in-from-right">
      <div className="mb-6">
        <Button variant="outline" onClick={() => window.history.back()} className="px-2">
          <ChevronLeft className="h-4 w-4" />
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

            <div className="mb-4">
              <Label htmlFor="docUpload">Upload Word Document</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="docUpload"
                  type="file"
                  accept=".docx"
                  onChange={handleFileUpload}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => document.getElementById('docUpload')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a Word document to automatically create content with embedded videos
              </p>
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
                    <Input
                      type="text"
                      placeholder="YouTube Video URL"
                      value={field.content}
                      onChange={(e) => updateContentField(field.id, 'content', e.target.value)}
                    />
                  ) : (
                    <RichTextEditor
                      content={field.content}
                      onChange={(newContent) => updateContentField(field.id, 'content', newContent)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => addContentField('text')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Text
              </Button>
              <Button type="button" variant="outline" onClick={() => addContentField('video')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Video
              </Button>
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
                          Week {activity.week} - Day {activity.day}
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
            <Form>
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
                      min="1"
                      max="7"
                    />
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
                        <Input
                          type="text"
                          placeholder="YouTube Video URL"
                          value={field.content}
                          onChange={(e) => updateEditingContentField(field.id, 'content', e.target.value)}
                        />
                      ) : (
                        <RichTextEditor
                          content={field.content}
                          onChange={(newContent) => updateEditingContentField(field.id, 'content', newContent)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => addEditingContentField('text')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Text
                  </Button>
                  <Button type="button" variant="outline" onClick={() => addEditingContentField('video')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Video
                  </Button>
                </div>

                <Button type="submit" disabled={updateActivityMutation.isPending}>
                  {updateActivityMutation.isPending ? "Updating..." : "Update Activity"}
                </Button>
              </form>
            </Form>
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

      {/* Bottom navigation for mobile */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav />
        </div>
      )}
    </div>
  );
}