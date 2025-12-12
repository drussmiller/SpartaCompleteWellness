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
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const response = await fetch("/api/activities", {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.status}`);
      }

      const data = await response.json();
      // Filter out Bible verses (activityTypeId = 0) from management view
      return data.filter((activity: Activity) => activity.activityTypeId !== 0);
    }
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
      
      // Debug: Log what mammoth returned
      console.log('=== MAMMOTH RAW OUTPUT ===');
      console.log('Content length:', content.length);
      console.log('First 1000 chars:', content.substring(0, 1000));
      console.log('Contains iframe?:', content.includes('<iframe'));
      console.log('Number of iframes:', (content.match(/<iframe/g) || []).length);

      // Clean up invalid HTML symbols that may be added during document conversion
      content = content
        .replace(/(<\/div>)\\?">/g, '$1') // Remove \"> after closing div tags specifically
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

      // CRITICAL: Strip ALL inline styles from Word docs - they override our CSS
      content = content.replace(/\s*style="[^"]*"/gi, '');
      content = content.replace(/\s*style='[^']*'/gi, '');

      // Strip margin/padding attributes
      content = content.replace(/\s*margin[^=]*="[^"]*"/gi, '');
      content = content.replace(/\s*padding[^=]*="[^"]*"/gi, '');

      // Use DOM parsing to properly normalize all iframes
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      
      // Process all iframes
      const iframes = doc.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        // Remove width and height attributes
        iframe.removeAttribute('width');
        iframe.removeAttribute('height');
        
        // Ensure allowfullscreen is set
        iframe.setAttribute('allowfullscreen', '');
        
        // Check if already wrapped in video-wrapper
        const parent = iframe.parentElement;
        if (!parent || !parent.classList.contains('video-wrapper')) {
          // Create wrapper div
          const wrapper = doc.createElement('div');
          wrapper.className = 'video-wrapper';
          
          // Wrap the iframe
          parent?.insertBefore(wrapper, iframe);
          wrapper.appendChild(iframe);
        }
      });
      
      // Serialize back to HTML
      content = doc.body.innerHTML.trim();

      // FIRST: Remove YouTube links from anchor tags (convert <a href="youtube">text</a> to just the YouTube URL)
      // This prevents the URL from being replaced inside the href attribute
      const ytLinkRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"']*)["'][^>]*>([^<]*)<\/a>/gi;
      content = content.replace(ytLinkRegex, (match: string, url: string) => {
        console.log('Found YouTube anchor, extracting URL:', url);
        return url; // Just return the bare URL, which will be converted to an embed below
      });

      console.log('After extracting YouTube URLs from anchors:', content.substring(0, 500));

      // SECOND: Convert all YouTube URLs (now bare text) to embedded players
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;

      content = content.replace(youtubeRegex, (match: string, videoId: string) => {
        console.log('Converting YouTube URL to embed:', match, 'Video ID:', videoId);
        if (!videoId) return match;
        return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
      });
      
      console.log('After YouTube conversion:', content.substring(0, 500));

      // Add visual separation after each video except the last one
      const allVideoMatches: Array<{match: string, index: number}> = [];
      const videoFindRegex = /<div class="video-wrapper"><iframe[^>]*><\/iframe><\/div>/g;
      let videoMatch;
      
      while ((videoMatch = videoFindRegex.exec(content)) !== null) {
        allVideoMatches.push({
          match: videoMatch[0],
          index: videoMatch.index
        });
      }
      
      // Add separator after each video except the last one (iterate backwards to preserve indices)
      for (let i = allVideoMatches.length - 2; i >= 0; i--) {
        const insertPosition = allVideoMatches[i].index + allVideoMatches[i].match.length;
        const separator = '<hr class="my-6 border-t border-gray-300">';
        content = content.substring(0, insertPosition) + separator + content.substring(insertPosition);
      }

      // Amazon URL processing - handle text before URL on same or previous line
      // Pattern 1: Text ending with colon, then Amazon URL (most common)
      // Matches: <p>Text:</p><p>amazonurl</p> OR <p>Text:<br>amazonurl</p>
      const amazonWithColonRegex = /<p>([^<]*?:)\s*<\/p>\s*<p>\s*(https?:\/\/(?:www\.)?amazon\.com\/[^\s<)"']+)/gi;
      content = content.replace(amazonWithColonRegex, (match: string, descText: string, url: string) => {
        const cleanDesc = descText.trim().replace(/:$/, '').trim(); // Remove trailing colon
        return `<p><a href="${url}" target="_blank" rel="noopener" style="color: #1e90ff; text-decoration: underline; font-weight: 500;">${cleanDesc}</a></p><p style="display:none;">`;
      });

      // Pattern 2: Text with colon and URL in same paragraph separated by <br>
      const amazonWithColonBreakRegex = /<p>([^<]*?:)\s*<br\s*\/?>\s*(https?:\/\/(?:www\.)?amazon\.com\/[^\s<)"']+)/gi;
      content = content.replace(amazonWithColonBreakRegex, (match: string, descText: string, url: string) => {
        const cleanDesc = descText.trim().replace(/:$/, '').trim();
        return `<p><a href="${url}" target="_blank" rel="noopener" style="color: #1e90ff; text-decoration: underline; font-weight: 500;">${cleanDesc}</a>`;
      });

      // Pattern 3: Any text in one <p>, URL in next <p>
      const amazonSeparateParasRegex = /<p>([^<]+?)<\/p>\s*<p>\s*(https?:\/\/(?:www\.)?amazon\.com\/[^\s<)"']+)\s*<\/p>/gi;
      content = content.replace(amazonSeparateParasRegex, (match: string, descText: string, url: string) => {
        const cleanDesc = descText.trim();
        // Only use description if it's not already a URL
        if (!cleanDesc.startsWith('http')) {
          return `<p><a href="${url}" target="_blank" rel="noopener" style="color: #1e90ff; text-decoration: underline; font-weight: 500;">${cleanDesc}</a></p>`;
        }
        return match;
      });

      // Pattern 4: Standalone Amazon URLs that weren't caught (fallback)
      const amazonStandaloneRegex = /<p>\s*(https?:\/\/(?:www\.)?amazon\.com\/[^\s<)"']+)\s*<\/p>/gi;
      content = content.replace(amazonStandaloneRegex, (match: string, url: string) => {
        // Only replace if it wasn't already converted to a link
        if (!content.includes(`href="${url}"`)) {
          return `<p><a href="${url}" target="_blank" rel="noopener" style="color: #1e90ff; text-decoration: underline; font-weight: 500;">${url}</a></p>`;
        }
        return match;
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
              <p className="text-gray-600 mb-2">{error instanceof Error ? error.message : 'An error occurred'}</p>
              <p className="text-sm text-gray-500 mb-4">
                Please try refreshing the page or contact support if the issue persists.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
                  window.location.reload();
                }}
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
      <div className="mx-auto w-full max-w-[1000px] px-6 md:px-44 md:pl-56 lg:border-x lg:border-border/40 bg-white space-y-8 pb-24">
          <div className="flex items-center mb-6 pt-6">
            <Button
              variant="ghost"
              onClick={() => window.history.back()}
              className="p-2 mr-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 scale-125"
            >
              <ChevronLeft className="h-8 w-8 scale-125" />
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

                          // Extract lines from the HTML content using DOMParser (safe from XSS)
                          const parser = new DOMParser();
                          const doc = parser.parseFromString(content, 'text/html');

                          // Extract lines by preserving paragraph structure from HTML
                          // Word docs convert to <p> tags or <div> tags for each line
                          const paragraphs = doc.querySelectorAll('p, div');
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
                            const textContent = doc.body.textContent || doc.body.innerText || '';
                            lines = textContent.split('\n').filter((line: string) => line.trim().length > 0);
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

                            // Server will handle the Bible verse link conversion
                            const contentFields = [
                              {
                                id: `bible-verse-${absoluteDay}`,
                                type: "text",
                                title: "",
                                content: `<div style="margin-bottom: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                                  <h3 style="margin: 0 0 10px 0; color: #007bff;">Today's Bible Verse</h3>
                                  <p style="margin: 0; font-size: 16px; font-weight: 500;">${verseLine}</p>
                                </div>`
                              }
                            ];

                            // Check if a Bible verse activity already exists for this week/day
                            const existingBibleVerse = activities?.find(activity => 
                              activity.week === week && activity.day === day && activity.activityTypeId === 0
                            );

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
                        // Extract workout type from filename (before "Week")
                        const workoutTypeMatch = file.name.match(/^([^W]+?)\s*Week/i);
                        let activityTypeId = selectedActivityTypeId;

                        if (workoutTypeMatch) {
                          // Remove trailing hyphen or dash from the workout type name
                          const workoutTypeName = workoutTypeMatch[1].trim().replace(/[-–]$/, '');

                          // Check if this workout type exists
                          let existingType = workoutTypes?.find(wt => 
                            wt.type.toLowerCase() === workoutTypeName.toLowerCase()
                          );

                          // If it doesn't exist, create it
                          if (!existingType) {
                            const createTypeRes = await apiRequest("POST", "/api/workout-types", {
                              type: workoutTypeName
                            });

                            if (createTypeRes.ok) {
                              const newType = await createTypeRes.json();
                              activityTypeId = newType.id;

                              // Refresh workout types
                              await queryClient.invalidateQueries({ queryKey: ["/api/workout-types"] });
                            } else {
                              // If creation fails (likely duplicate), try to find it again after refresh
                              await queryClient.invalidateQueries({ queryKey: ["/api/workout-types"] });
                              const refreshedTypes = queryClient.getQueryData<WorkoutType[]>(["/api/workout-types"]);
                              const foundType = refreshedTypes?.find(wt => 
                                wt.type.toLowerCase() === workoutTypeName.toLowerCase()
                              );
                              if (foundType) {
                                activityTypeId = foundType.id;
                              }
                            }
                          } else {
                            activityTypeId = existingType.id;
                          }
                        }

                        // Extract week and day from filename
                        // Support both "Week X Day Y" and "Week X" formats (Week only defaults to Day 0)
                        const weekDayMatch = file.name.match(/Week\s*(\d+(?:-\d+)?)(?:[,\s]*Day\s*(\d+))?/i);
                        if (!weekDayMatch) {
                          throw new Error(`Could not extract week from filename: ${file.name}`);
                        }

                        const weekPart = weekDayMatch[1];
                        const dayPart = weekDayMatch[2] ? parseInt(weekDayMatch[2]) : 0; // Default to Day 0 if not specified

                        // Parse week numbers (could be single number or range like 9-11)
                        const weekNumbers: number[] = [];
                        if (weekPart.includes('-')) {
                          const [start, end] = weekPart.split('-').map(Number);
                          for (let w = start; w <= end; w++) {
                            weekNumbers.push(w);
                          }
                        } else {
                          weekNumbers.push(parseInt(weekPart));
                        }

                        // Get or parse content
                        let contentHtml = '';
                        if (file.name.toLowerCase().endsWith('.docx')) {
                          // Upload and parse the document
                          const formData = new FormData();
                          formData.append('document', file);

                          const uploadRes = await apiRequest("POST", "/api/activities/upload-doc", formData);

                          if (!uploadRes.ok) {
                            const errorData = await uploadRes.json();
                            throw new Error(errorData.message || `Failed to upload ${file.name}`);
                          }

                          const uploadData = await uploadRes.json();
                          contentHtml = uploadData.content;

                          // CRITICAL: Strip ALL inline styles from Word docs - they override our CSS
                          contentHtml = contentHtml.replace(/\s*style="[^"]*"/gi, '');
                          contentHtml = contentHtml.replace(/\s*style='[^']*'/gi, '');

                          // Strip margin/padding attributes
                          contentHtml = contentHtml.replace(/\s*margin[^=]*="[^"]*"/gi, '');
                          contentHtml = contentHtml.replace(/\s*padding[^=]*="[^"]*"/gi, '');

                          // Use DOM parsing to properly normalize all iframes
                          const parser = new DOMParser();
                          const doc = parser.parseFromString(contentHtml, 'text/html');
                          
                          // Process all iframes
                          const iframes = doc.querySelectorAll('iframe');
                          iframes.forEach(iframe => {
                            // Remove width and height attributes
                            iframe.removeAttribute('width');
                            iframe.removeAttribute('height');
                            
                            // Ensure allowfullscreen is set
                            iframe.setAttribute('allowfullscreen', '');
                            
                            // Check if already wrapped in video-wrapper
                            const parent = iframe.parentElement;
                            if (!parent || !parent.classList.contains('video-wrapper')) {
                              // Create wrapper div
                              const wrapper = doc.createElement('div');
                              wrapper.className = 'video-wrapper';
                              
                              // Wrap the iframe
                              parent?.insertBefore(wrapper, iframe);
                              wrapper.appendChild(iframe);
                            }
                          });
                          
                          // Serialize back to HTML
                          contentHtml = doc.body.innerHTML.trim();

                          // FIRST: Remove YouTube links from anchor tags (convert <a href="youtube">text</a> to just the YouTube URL)
                          // This prevents the URL from being replaced inside the href attribute
                          const ytLinkRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^"']*)["'][^>]*>([^<]*)<\/a>/gi;
                          contentHtml = contentHtml.replace(ytLinkRegex, (match: string, url: string) => {
                            console.log('[BULK UPLOAD] Found YouTube anchor, extracting URL:', url);
                            return url; // Just return the bare URL, which will be converted to an embed below
                          });

                          console.log('[BULK UPLOAD] After extracting YouTube URLs from anchors');

                          // SECOND: Convert all YouTube URLs (now bare text) to embedded players
                          const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?/gi;

                          contentHtml = contentHtml.replace(youtubeRegex, (match: string, videoId: string) => {
                            console.log('[BULK UPLOAD] Converting YouTube URL to embed:', match, 'Video ID:', videoId);
                            if (!videoId) return match;
                            return `<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
                          });
                          
                          console.log('[BULK UPLOAD] After YouTube conversion');

                          // Remove consecutive duplicate YouTube videos
                          const videoEmbedRegex = /<div class="video-wrapper"><iframe src="https:\/\/www\.youtube\.com\/embed\/([a-zA-Z0-9_-]{11})"[^>]*><\/iframe><\/div>/g;
                          const videos: Array<{videoId: string, fullMatch: string, index: number}> = [];
                          let match;

                          // Find all video embeds
                          while ((match = videoEmbedRegex.exec(contentHtml)) !== null) {
                            videos.push({
                              videoId: match[1],
                              fullMatch: match[0],
                              index: match.index
                            });
                          }

                          // Remove consecutive duplicates (compare with previous video only)
                          for (let i = videos.length - 1; i > 0; i--) {
                            if (videos[i].videoId === videos[i - 1].videoId) {
                              // Same video as the previous one - remove this duplicate
                              contentHtml = contentHtml.substring(0, videos[i].index) + contentHtml.substring(videos[i].index + videos[i].fullMatch.length);
                            }
                          }

                          // Add visual separation after each video except the last one
                          // Replace video wrappers with video + separator, except for the last occurrence
                          const allVideoMatches: Array<{match: string, index: number}> = [];
                          const videoFindRegex = /<div class="video-wrapper"><iframe[^>]*><\/iframe><\/div>/g;
                          let videoMatch;
                          
                          while ((videoMatch = videoFindRegex.exec(contentHtml)) !== null) {
                            allVideoMatches.push({
                              match: videoMatch[0],
                              index: videoMatch.index
                            });
                          }
                          
                          // Add separator after each video except the last one (iterate backwards to preserve indices)
                          for (let i = allVideoMatches.length - 2; i >= 0; i--) {
                            const insertPosition = allVideoMatches[i].index + allVideoMatches[i].match.length;
                            const separator = '<hr class="my-6 border-t border-gray-300">';
                            contentHtml = contentHtml.substring(0, insertPosition) + separator + contentHtml.substring(insertPosition);
                          }
                        } else {
                          throw new Error(`Unsupported file type for ${file.name}`);
                        }

                        // Create content fields without automatic titles
                        const contentFields = [{
                          id: crypto.randomUUID(),
                          type: 'text' as const,
                          content: contentHtml,
                          title: ""
                        }];

                        // Process each week in the range
                        for (const weekNum of weekNumbers) {
                          const activityData = {
                            week: weekNum,
                            day: dayPart,
                            contentFields: contentFields,
                            activityTypeId: activityTypeId
                          };

                          // Create or update the activity
                          const activityRes = await apiRequest("POST", "/api/activities", activityData);
                          if (!activityRes.ok) {
                            const errorData = await activityRes.json();
                            throw new Error(errorData.message || `Failed to save activity for ${file.name} Week ${weekNum}`);
                          }

                          const responseData = await activityRes.json();
                          processedCount++;
                        }

                        const activityType = dayPart === 0 ? "Week Information" : `Day ${dayPart}`;
                        const weekRange = weekNumbers.length > 1 
                          ? `Weeks ${weekNumbers[0]}-${weekNumbers[weekNumbers.length - 1]}` 
                          : `Week ${weekNumbers[0]}`;
                        toast({
                          title: "Success",
                          description: `Created/Updated ${file.name} - ${weekRange} ${activityType}`
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