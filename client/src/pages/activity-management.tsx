import React from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, WorkoutType } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Edit, Trash2, X, Plus, Loader2, Upload, ChevronLeft, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppLayout } from "@/components/app-layout";
import { Switch } from "@/components/ui/switch";
import { YouTubePlayer } from "@/components/ui/youtube-player";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [extractedWeek, setExtractedWeek] = useState<number | null>(null);
  const [extractedDay, setExtractedDay] = useState<number | null>(null);
  const [selectedActivityTypeId, setSelectedActivityTypeId] = useState<number>(1); // Default to "Bands"
  const [editingActivityTypeId, setEditingActivityTypeId] = useState<number>(1);
  const isMobile = useIsMobile();

  const { data: activities, isLoading, error } = useQuery<Activity[]>({
    queryKey: ["/api/activities"]
  });

  const { data: workoutTypes } = useQuery<WorkoutType[]>({
    queryKey: ["/api/workout-types"]
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
    setEditingActivityTypeId(activity.activityTypeId || 1);
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

    // Extract week and day from filename
    const filename = file.name.replace('.docx', '');
    const numbers = filename.match(/\d+/g);

    if (!numbers || numbers.length < 2) {
      toast({
        title: "Invalid filename",
        description: "Filename must contain at least 2 numbers (week and day). Example: 'Week1Day2.docx'",
        variant: "destructive"
      });
      return;
    }

    const extractedWeek = parseInt(numbers[0]);
    const extractedDay = parseInt(numbers[1]);

    if (isNaN(extractedWeek) || isNaN(extractedDay) || extractedWeek < 1 || extractedDay < 1 || extractedDay > 7) {
      toast({
        title: "Invalid numbers",
        description: "Week must be >= 1 and day must be between 1-7",
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
      let title = filename;

      let content = data.content;

      // Clean up invalid HTML symbols that may be added during document conversion
      content = content
        .replace(/(<\/div>)\\?">/g, '$1') // Remove \"> after closing div tags specifically
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

      // Track unique video IDs to prevent duplicates
      const seenVideoIds = new Set<string>();

      // First, replace complete anchor tags containing YouTube URLs (from hyperlinked URLs in Word docs)
      // This matches: <a href="YOUTUBE_URL">...anything...</a>
      content = content.replace(/<a[^>]*href=["']?((?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"'\s>]*)["']?[^>]*>.*?<\/a>/gi, (match: string, url: string, videoId: string) => {
        if (!videoId) return match;

        // If we've already embedded this video, remove the duplicate
        if (seenVideoIds.has(videoId)) {
          return '';
        }

        seenVideoIds.add(videoId);
        return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
      });

      // Then, replace any remaining standalone YouTube URLs (not wrapped in anchor tags)
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;
      content = content.replace(youtubeRegex, (match: string, videoId: string) => {
        if (!videoId) return match;

        // If we've already embedded this video, remove the duplicate
        if (seenVideoIds.has(videoId)) {
          return '';
        }

        seenVideoIds.add(videoId);
        return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
      });

      // Bible verses are kept as plain text

      // Create single content field with embedded videos in correct positions
      const newFields: ContentField[] = [{
        id: Math.random().toString(36).substring(7),
        type: 'text',
        content: content.trim(),
        title: title
      }];

      setContentFields(newFields);

      // Store the extracted numbers
      setExtractedWeek(extractedWeek);
      setExtractedDay(extractedDay);

      toast({
        title: "Success",
        description: `Document processed successfully. Detected Week ${extractedWeek}, Day ${extractedDay}`
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


        <div className="border rounded-md p-4 bg-muted/20">
            <div className="space-y-6">
            <div className="mb-8">
              <Label htmlFor="multiFileUpload">Upload Multiple Word Documents (Hold Ctrl/Cmd to select multiple)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="multiFileUpload"
                  type="file"
                  accept=".docx"
                  multiple
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1"
                  onChange={async (event) => {
                    const files = event.target.files;
                    if (!files || files.length === 0) return;

                    console.log(`Selected ${files.length} files:`, Array.from(files).map(f => f.name));

                    toast({
                      title: "Processing Files",
                      description: `Processing ${files.length} files...`
                    });

                    // Process each file sequentially
                    let processedCount = 0;
                    let skippedCount = 0;

                    for (let i = 0; i < files.length; i++) {
                      const file = files[i];

                      try {
                        // Check if this is a BibleVerses.Doc file (case insensitive)
                        const isBibleVersesDoc = file.name.toLowerCase().includes('bibleverses');

                        if (isBibleVersesDoc) {
                          // Special handling for BibleVerses.Doc
                          const formData = new FormData();
                          formData.append('document', file);

                          const uploadRes = await fetch('/api/activities/upload-doc', {
                            method: 'POST',
                            body: formData,
                            credentials: 'include'
                          });

                          if (!uploadRes.ok) {
                            throw new Error(`Failed to process ${file.name}`);
                          }

                          const uploadData = await uploadRes.json();
                          const content = uploadData.content;

                          // Extract lines from the HTML content
                          const tempDiv = document.createElement('div');
                          tempDiv.innerHTML = content;

                          // Extract lines by preserving paragraph structure from HTML
                          // Word docs convert to <p> tags or <div> tags for each line
                          const paragraphs = tempDiv.querySelectorAll('p, div');
                          let lines: string[] = [];

                          if (paragraphs.length > 0) {
                            // Extract text from each paragraph/div
                            paragraphs.forEach(para => {
                              const text = (para.textContent || '').trim();
                              if (text.length > 0) {
                                lines.push(text);
                              }
                            });
                          } else {
                            // Fallback: try splitting by newlines if no paragraph structure
                            const textContent = tempDiv.textContent || tempDiv.innerText || '';
                            lines = textContent.split('\n').filter(line => line.trim().length > 0);
                          }

                          console.log(`Processing BibleVerses.Doc with ${lines.length} lines:`, lines);

                          // Create separate Bible verse activities for each line
                          // Calculate week and day from absolute day number (line index + 1)
                          // These will be stored with activityTypeId = 0 to distinguish them as Bible verses
                          for (let dayIndex = 0; dayIndex < lines.length; dayIndex++) {
                            const absoluteDay = dayIndex + 1; // Absolute day 1, 2, 3, etc.
                            const week = Math.ceil(absoluteDay / 7); // Week 1-52
                            const day = absoluteDay % 7 || 7; // Day 1-7 (7 instead of 0)
                            const verseLine = lines[dayIndex].trim();

                            if (!verseLine) continue;

                            // Convert the verse to a clickable link
                            const bibleVerseRegex = /\b(?:(?:1|2|3)\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Kings|(?:1|2)\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\s+of\s+Songs?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s*Corinthians|Galatians?|Galation|Ephesians|Philippians|Philippians|Colossians|(?:1|2)\s*Thessalonians|(?:1|2)\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s*Peter|(?:1|2|3)\s*John|Jude|Revelation)\s+\d+\s*:\s*(?:Verses?\s+)?\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*\b/gi;

                            const verseWithLink = verseLine.replace(bibleVerseRegex, (match) => {
                              const cleanVerse = match
                                .replace(/\s+/g, '')
                                .replace(/Psalms/gi, 'Psalm')
                                .replace(/Galation/gi, 'Galatians');
                              const bibleUrl = `https://www.bible.com/search/bible?q=${encodeURIComponent(match)}`;
                              return `<a href="${bibleUrl}" target="_blank" rel="noopener noreferrer">${match}</a>`;
                            });

                            // Create the Bible verse section HTML
                            const bibleVerseHTML = `<div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;"><h3 style="margin: 0 0 10px 0; color: #007bff;">Today's Bible Verse</h3><p style="margin: 0; font-size: 16px; font-weight: 500;">${verseWithLink}</p></div>`;

                            // Check if a Bible verse activity already exists for this week/day
                            const existingBibleVerse = activities?.find(activity => 
                              activity.week === week && activity.day === day && activity.activityTypeId === 0
                            );

                            const contentFields = [{
                              id: Math.random().toString(36).substring(7),
                              type: 'text',
                              content: bibleVerseHTML,
                              title: `Day ${absoluteDay} Bible Verse`
                            }];

                            if (existingBibleVerse) {
                              // Update existing Bible verse activity
                              const updateRes = await apiRequest("PUT", `/api/activities/${existingBibleVerse.id}`, {
                                week: week,
                                day: day,
                                activityTypeId: 0, // 0 = Bible verse
                                contentFields: contentFields
                              });

                              if (!updateRes.ok) {
                                const errorData = await updateRes.json();
                                throw new Error(errorData.message || `Failed to update Bible verse for absolute day ${absoluteDay}`);
                              }

                              processedCount++;
                              toast({
                                title: "Success",
                                description: `Updated Bible verse for Day ${absoluteDay}: ${verseLine}`
                              });
                            } else {
                              // Create new Bible verse activity
                              const activityData = {
                                week: week,
                                day: day,
                                contentFields: contentFields,
                                activityTypeId: 0 // 0 = Bible verse (special type)
                              };

                              const activityRes = await apiRequest("POST", "/api/activities", activityData);
                              if (!activityRes.ok) {
                                const errorData = await activityRes.json();
                                throw new Error(errorData.message || `Failed to save Bible verse activity for absolute day ${absoluteDay}`);
                              }

                              processedCount++;
                              toast({
                                title: "Success",
                                description: `Created Bible verse for Day ${absoluteDay} (Week ${week}, Day ${day}): ${verseLine}`
                              });
                            }
                          }

                          continue; // Skip the normal processing for this file
                        }

                        // Normal processing for non-BibleVerses files
                        // Extract week and day from filename
                        const filename = file.name.replace('.docx', '');
                        const numbers = filename.match(/\d+/g);

                        if (!numbers || numbers.length < 1) {
                          skippedCount++;
                          toast({
                            title: `Skipping ${file.name}`,
                            description: "Filename must contain at least 1 number (week). Examples: 'Week25.docx' or 'Week1Day2.docx'",
                            variant: "destructive"
                          });
                          continue;
                        }

                        const extractedWeek = parseInt(numbers[0]);
                        const extractedDay = numbers.length >= 2 ? parseInt(numbers[1]) : 0; // Default to 0 for week-only content

                        if (isNaN(extractedWeek) || extractedWeek < 1) {
                          skippedCount++;
                          toast({
                            title: `Skipping ${file.name}`,
                            description: "Week number must be >= 1",
                            variant: "destructive"
                          });
                          continue;
                        }

                        if (extractedDay !== 0 && (isNaN(extractedDay) || extractedDay < 1 || extractedDay > 7)) {
                          skippedCount++;
                          toast({
                            title: `Skipping ${file.name}`,
                            description: "Day number must be between 1-7 (or omit for week-only content)",
                            variant: "destructive"
                          });
                          continue;
                        }

                        // Upload and process the document
                        const formData = new FormData();
                        formData.append('document', file);

                        const uploadRes = await fetch('/api/activities/upload-doc', {
                          method: 'POST',
                          body: formData,
                          credentials: 'include'
                        });

                        if (!uploadRes.ok) {
                          throw new Error(`Failed to process ${file.name}`);
                        }

                        const uploadData = await uploadRes.json();
                        let title = filename;

                        let content = uploadData.content;

                        // Clean up invalid HTML symbols that may be added during document conversion
                        content = content
                          .replace(/(<\/div>)\\?">/g, '$1') // Remove \"> after closing div tags specifically
                          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                          .replace(/(<\/p>)\s*(<p[^>]*>)/g, '$1\n$2') // Add line breaks between paragraphs
                          .replace(/(<\/div>)\s*(<div[^>]*>)/g, '$1\n$2') // Add line breaks between divs
                          .trim();

                        // Track unique video IDs to prevent duplicates
                        const seenVideoIds = new Set<string>();

                        // First, replace complete anchor tags containing YouTube URLs (from hyperlinked URLs in Word docs)
                        // This matches: <a href="YOUTUBE_URL">...anything...</a>
                        content = content.replace(/<a[^>]*href=["']?((?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"'\s>]*)["']?[^>]*>.*?<\/a>/gi, (match: string, url: string, videoId: string) => {
                          if (!videoId) return match;

                          // If we've already embedded this video, remove the duplicate
                          if (seenVideoIds.has(videoId)) {
                            return '';
                          }

                          seenVideoIds.add(videoId);
                          return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
                        });

                        // Then, replace any remaining standalone YouTube URLs (not wrapped in anchor tags)
                        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;
                        content = content.replace(youtubeRegex, (match: string, videoId: string) => {
                          if (!videoId) return match;

                          // If we've already embedded this video, remove the duplicate
                          if (seenVideoIds.has(videoId)) {
                            return '';
                          }

                          seenVideoIds.add(videoId);
                          return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
                        });

                        // Bible verses are kept as plain text

                        // Create activity data
                        const contentFields = [{
                          id: Math.random().toString(36).substring(7),
                          type: 'text',
                          content: content.trim(),
                          title: title
                        }];

                        const activityData = {
                          week: extractedWeek,
                          day: extractedDay,
                          contentFields: contentFields,
                          activityTypeId: selectedActivityTypeId
                        };

                        // Create or update the activity
                        const activityRes = await apiRequest("POST", "/api/activities", activityData);
                        if (!activityRes.ok) {
                          const errorData = await activityRes.json();
                          throw new Error(errorData.message || `Failed to save activity for ${file.name}`);
                        }

                        const responseData = await activityRes.json();
                        processedCount++;
                        const activityType = extractedDay === 0 ? "Week Information" : `Day ${extractedDay}`;
                        toast({
                          title: "Success",
                          description: `${responseData.message ? 'Updated' : 'Created'} ${file.name} - Week ${extractedWeek} ${activityType}`
                        });

                      } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error(`Error processing ${file.name}:`, {
                          error,
                          message: errorMessage,
                          stack: error instanceof Error ? error.stack : undefined
                        });
                        skippedCount++;
                        toast({
                          title: "Error",
                          description: `Failed to process ${file.name}: ${errorMessage}`,
                          variant: "destructive"
                        });
                      }
                    }

                    // Refresh the activities list
                    queryClient.invalidateQueries({ queryKey: ["/api/activities"] });

                    // Clear the file input
                    event.target.value = '';

                    // Show completion message with accurate counts
                    const summaryMessage = skippedCount > 0
                      ? `Processed ${processedCount} files successfully, ${skippedCount} files skipped`
                      : `Successfully processed ${processedCount} files`;

                    toast({
                      title: "Batch Processing Complete",
                      description: summaryMessage
                    });
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Select Word documents to process in batch. Filenames should contain week number and optionally day number (e.g., "Week25.docx" for week info or "Week1Day2.docx" for daily content). Special: Files named "BibleVerses.docx" will create daily Bible verse activities with each line becoming a day's verse.
              </p>
            </div>


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
            </div>
        </div>

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
                  contentFields: editingContentFields,
                  activityTypeId: editingActivityTypeId
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

                <div>
                  <Label htmlFor="editActivityType">Activity Type</Label>
                  <Select
                    value={editingActivityTypeId.toString()}
                    onValueChange={(value) => setEditingActivityTypeId(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {workoutTypes?.map((workoutType) => (
                        <SelectItem key={workoutType.id} value={workoutType.id.toString()}>
                          {workoutType.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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