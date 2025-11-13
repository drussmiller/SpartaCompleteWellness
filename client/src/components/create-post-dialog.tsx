import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CalendarIcon, Loader2, Video } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertPostSchema } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePostLimits } from "@/hooks/use-post-limits";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CreatePostForm = z.infer<typeof insertPostSchema> & {
  postDate?: Date;
  postScope?: "everyone" | "organization" | "group" | "team" | "my_team";
  targetOrganizationId?: number | null;
  targetGroupId?: number | null;
  targetTeamId?: number | null;
};

export function CreatePostDialog({
  remaining: propRemaining,
  initialType = "food",
  defaultType = null,
  hideTypeField = false
}: {
  remaining: Record<string, number>;
  initialType?: string;
  defaultType?: string | null;
  hideTypeField?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { canPost, counts, refetch, remaining, memoryVerseWeekCount } = usePostLimits(selectedDate);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [selectedExistingVideo, setSelectedExistingVideo] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<"image" | "video" | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [postScope, setPostScope] = useState<"everyone" | "organization" | "group" | "team" | "my_team">("my_team");

  // Fetch organizations for admin users
  const { data: organizations = [] } = useQuery({
    queryKey: ["/api/organizations"],
    enabled: !!user?.isAdmin && open,
  });

  // Fetch groups for admin and group admin users
  const { data: groups = [] } = useQuery({
    queryKey: ["/api/groups"],
    enabled: !!(user?.isAdmin || user?.isGroupAdmin) && open,
  });

  // Fetch teams for admin and group admin users
  const { data: teams = [] } = useQuery({
    queryKey: ["/api/teams"],
    enabled: !!(user?.isAdmin || user?.isGroupAdmin) && open,
  });

  // Check if user's team is in a competitive group
  const { data: isCompetitive = false, isLoading: isLoadingCompetitive } = useQuery({
    queryKey: ["/api/teams/competitive", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) return false;
      const response = await fetch(`/api/teams/${user.teamId}/competitive`, {
        credentials: 'include'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.competitive === true;
    },
    enabled: !!user?.teamId,
    staleTime: 300000, // 5 minutes
  });

  // Check if user has any posts (all new users must post intro video first)
  const { data: hasAnyPosts = false } = useQuery({
    queryKey: ["/api/posts/has-any-posts", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const response = await fetch(`/api/posts/has-any-posts`, {
        credentials: 'include'
      });
      if (!response.ok) return false;
      const result = await response.json();
      return result.hasAnyPosts || false;
    },
    enabled: !!user, // Check for all users
    staleTime: 300000, // 5 minutes
  });

  // Define the type for memory verse video objects
  type MemoryVerseVideo = {
    id: number;
    content: string;
    mediaUrl: string;
    createdAt: string;
  };

  // For users who haven't posted anything, default to introductory_video (0 points)
  // For users who have posted, default to food
  const shouldDefaultToIntroVideo = !hasAnyPosts;
  const actualType = shouldDefaultToIntroVideo ? "introductory_video" : (defaultType || "food");

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: actualType,
      content: "",
      mediaUrl: null,
      points: actualType === "introductory_video" ? 0 : actualType === "prayer" ? 0 : actualType === "memory_verse" ? 10 : 3,
      postDate: selectedDate,
      postScope: user?.teamId ? "my_team" : "everyone",
      targetOrganizationId: null,
      targetGroupId: null,
      targetTeamId: null,
    }
  });

  // Update form type when hasAnyPosts changes or dialog opens
  useEffect(() => {
    if (open && !defaultType) {
      const newType = hasAnyPosts ? "food" : "introductory_video";
      form.setValue("type", newType);
      const newPoints = newType === "introductory_video" ? 0 : newType === "prayer" ? 0 : newType === "memory_verse" ? 10 : 3;
      form.setValue("points", newPoints);
    }
  }, [open, hasAnyPosts, defaultType, form]);

  // Fetch existing memory verse videos for reuse
  const { data: existingMemoryVerseVideos, isLoading: loadingVideos } = useQuery<MemoryVerseVideo[]>({
    queryKey: ['/api/memory-verse-videos'],
    queryFn: async () => {
      const response = await fetch('/api/memory-verse-videos');
      if (!response.ok) {
        throw new Error('Failed to fetch memory verse videos');
      }
      return response.json();
    },
    enabled: open && form.watch("type") === "memory_verse" // Only fetch when dialog is open and type is memory_verse
  });

  function getRemainingMessage(type: string) {
    const selectedDayOfWeek = selectedDate.getDay();

    if (type === 'food') {
      if (selectedDayOfWeek === 0) {
        return "(food posts not allowed on Sunday)";
      }
      if (counts.food >= 3) {
        return "(already posted 3 meals today)";
      }
      return `(${remaining.food} meals remaining today)`;
    }

    if (type === 'workout') {
      if (counts.workout > 0) {
        return "(already posted workout today)";
      }
      return "(up to 5 workouts per week)";
    }

    if (type === 'scripture') {
      if (counts.scripture > 0) {
        return "(already posted today)";
      }
      return "(1 reading per day)";
    }

    if (type === 'memory_verse') {
      if (memoryVerseWeekCount > 0) {
        return "(already posted this week)";
      }
      return "(1 verse per week)";
    }

    return ""; // No limit text for miscellaneous
  }

  // Add a function to check if a post type should be disabled
  function isPostTypeDisabled(type: string) {
    // Use the canPost values directly from the usePostLimits hook
    // This ensures consistency between the dropdown display and button status
    switch (type) {
      case 'food':
        return !canPost.food;
      case 'workout':
        return !canPost.workout;
      case 'scripture':
        return !canPost.scripture;
      case 'memory_verse':
        return memoryVerseWeekCount > 0;
      case 'miscellaneous':
        return !canPost.miscellaneous; // Always false (enabled)
      default:
        return false;
    }
  }

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostForm) => {
      try {
        console.log("🚀🚀🚀 MUTATION FUNCTION CALLED with data:", data);
        console.log("🚀 SCOPE DATA IN MUTATION:", {
          postScope: data.postScope,
          targetOrganizationId: data.targetOrganizationId,
          targetGroupId: data.targetGroupId,
          targetTeamId: data.targetTeamId
        });
        console.log("Starting post creation for type:", data.type);
        const formData = new FormData();

        if ((data.type === 'food' || data.type === 'workout') && (!data.mediaUrl || data.mediaUrl.length === 0)) {
          console.error(`${data.type} post missing required image`);
          throw new Error(`${data.type === 'food' ? 'Food' : 'Workout'} posts require an image`);
        }

        // Add explicit validation for memory verse posts
        if (data.type === 'memory_verse' && (!data.mediaUrl || (data.mediaUrl.length === 0 && !data.mediaUrl.startsWith('EXISTING_VIDEO:')))) {
          console.error('Memory verse post missing required video');
          throw new Error('Memory verse posts require a video file');
        }

        // Handle case where an existing memory verse video was selected
        if (data.type === 'memory_verse' && data.mediaUrl && data.mediaUrl.startsWith('EXISTING_VIDEO:')) {
          // Extract the existing video ID
          const existingVideoId = data.mediaUrl.replace('EXISTING_VIDEO:', '');
          console.log("Using existing memory verse video:", { id: existingVideoId });

          // Include a special field in the post data to indicate we're using an existing video
          formData.append("existing_video_id", existingVideoId);

          // We don't need to append any image/video file since we're using an existing one
        }
        // Handle regular media uploads
        else if (data.mediaUrl && data.mediaUrl.length > 0) {
          console.log("Media URL found, preparing to upload", {
            type: data.type,
            mediaUrlLength: data.mediaUrl.length,
            urlPreview: data.mediaUrl.substring(0, 30) + "..."
          });

          try {
            // Handle memory verse, introductory video, miscellaneous, and prayer post video uploads
            if ((data.type === 'memory_verse' || data.type === 'introductory_video' || (data.type === 'miscellaneous' && selectedMediaType === 'video') || (data.type === 'prayer' && selectedMediaType === 'video')) &&
                videoInputRef.current && videoInputRef.current.files && videoInputRef.current.files.length > 0) {
              const videoFile = videoInputRef.current.files[0];

              // Append the video file to the formData with the 'image' field name
              // The server will detect the post type based on the data.type field
              formData.append("image", videoFile);

              // Explicitly set is_video flag for miscellaneous posts
              formData.append("is_video", "true");
              formData.append("selected_media_type", "video");

              // Attach the generated thumbnail if we have one
              if (videoThumbnail) {
                console.log("Attaching video thumbnail to the form data");

                // Convert the data URL to a Blob that we can send to the server
                const thumbnailBlob = dataURLToBlob(videoThumbnail);

                // Create a clean filename without any special characters
                const cleanFilename = videoFile.name.replace(/[^a-zA-Z0-9.]/g, '-');

                // Add the main poster thumbnail
                formData.append("thumbnail", thumbnailBlob, `${cleanFilename}.poster.jpg`);
                console.log(`Added poster thumbnail as: ${cleanFilename}.poster.jpg`);

                // Also add JPG version with thumb- prefix for consistent naming
                formData.append("thumbnail_alt", thumbnailBlob, `thumb-${cleanFilename}`);
                console.log(`Added thumb- prefixed thumbnail`);

                // Add a plain JPG version with the same basename for direct access
                const baseFilename = cleanFilename.replace(/\.mov$/i, '.jpg');
                formData.append("thumbnail_jpg", thumbnailBlob, baseFilename);
                console.log(`Added pure JPG thumbnail: ${baseFilename}`);
              } else {
                console.warn("No video thumbnail available when uploading video");
              }

              console.log(`Uploading ${data.type} video file:`, {
                fileName: videoFile.name,
                fileType: videoFile.type,
                fileSize: videoFile.size,
                fileSizeMB: (videoFile.size / (1024 * 1024)).toFixed(2) + "MB",
                hasThumbnail: !!videoThumbnail,
                postType: data.type
              });
            }
            // Handle memory verse posts with no video
            else if (data.type === 'memory_verse' && !selectedExistingVideo) {
              console.error("Memory verse post missing video file");
              throw new Error("No video file selected");
            }
            // Handle regular image uploads (including miscellaneous posts with images)
            else if (data.mediaUrl && data.mediaUrl.length > 0 &&
                    !(data.type === 'miscellaneous' && selectedMediaType === 'video') &&
                    data.type !== 'introductory_video') {
              // For images, fetch the blob from the data URL
              console.log("Processing image URL to blob");
              const blob = await fetch(data.mediaUrl).then(r => r.blob());
              console.log("Blob created from image URL", {
                type: blob.type,
                size: blob.size
              });
              formData.append("image", blob, "image.jpeg");
              console.log("Image blob appended to form data");
            }
          } catch (error) {
            console.error("Error processing media:", error);
            throw new Error("Failed to process media file");
          }
        }

        // Use the content as-is without adding a [VIDEO] marker
        let content = data.content?.trim() || '';

        const postData = {
          type: data.type,
          content: content,
          points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : data.type === "miscellaneous" ? 0 : 3,
          createdAt: data.postDate ? data.postDate.toISOString() : selectedDate.toISOString(),
          postScope: data.postScope || postScope || "my_team",
          targetOrganizationId: data.targetOrganizationId || null,
          targetGroupId: data.targetGroupId || null,
          targetTeamId: data.targetTeamId || null,
        };

        console.log("📦 POST DATA OBJECT BEFORE STRINGIFY:", postData);
        console.log("📦 SCOPE FIELDS:", {
          postScope: postData.postScope,
          targetOrganizationId: postData.targetOrganizationId,
          targetGroupId: postData.targetGroupId,
          targetTeamId: postData.targetTeamId
        });

        // Add special identifier for miscellaneous post type if it has video
        if (data.type === 'miscellaneous' && selectedMediaType) {
          formData.append("selected_media_type", selectedMediaType);

          // Explicitly add an is_video flag to ensure server-side detection works correctly
          if (selectedMediaType === "video") {
            formData.append("is_video", "true");
          }

          console.log("Added media type marker for miscellaneous post:", {
            selectedMediaType,
            isVideo: selectedMediaType === "video",
            contentWithVideoMarker: postData.content
          });
        }

        const postDataJSON = JSON.stringify(postData);
        console.log("📦 STRINGIFIED POST DATA:", postDataJSON);
        console.log("📦 JSON includes postScope?", postDataJSON.includes("postScope"));
        console.log("📦 JSON includes targetTeamId?", postDataJSON.includes("targetTeamId"));
        
        formData.append("data", postDataJSON);

        console.log("FormData ready for submission", {
          formDataKeys: Array.from(formData.keys()),
          hasImageKey: formData.has('image'),
          isMultipartFormData: true
        });

        console.log("Sending POST request to /api/posts");

        const response = await fetch("/api/posts", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        // Add more detailed logging of response
        console.log(`Response status: ${response.status} ${response.statusText}`);

        // Log the full response headers for debugging
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        console.log("Response headers:", responseHeaders);

        console.log("Server response received", {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Server returned error", errorData);
          throw new Error(errorData.message || `Failed to create post: ${response.status}`);
        }

        return response.json();
      } catch (error) {
        console.error("Post creation error:", error);
        throw error;
      }
    },
    onMutate: async (data: CreatePostForm) => {
      await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
      const previousPosts = queryClient.getQueryData(["/api/posts"]);

      const optimisticPost = {
        id: Date.now(),
        type: data.type,
        content: data.content,
        mediaUrl: imagePreview,
        createdAt: data.postDate || new Date(),
        author: user,
        points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : data.type === "miscellaneous" ? 0 : 3,
        is_video: data.type === "memory_verse" || (data.type === "miscellaneous" && selectedMediaType === "video")
      };

      queryClient.setQueryData(["/api/posts", "team-posts"], (old: any[] = []) => [optimisticPost, ...old]);

      return { previousPosts };
    },
    onSuccess: (newPost: any) => {
      // Clear all form state and close the dialog
      form.reset();
      setOpen(false);
      setImagePreview(null);
      setVideoThumbnail(null);
      setSelectedMediaType(null);
      setSelectedExistingVideo(null);
      setPostScope("my_team");

      // Clear any file inputs
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      console.log("Post created successfully, invalidating queries to update UI");

      // Also update prayer requests cache if this is a prayer post
      if (newPost.type === "prayer") {
        queryClient.setQueryData(["/api/posts/prayer-requests"], (old: any[] = []) => {
          return [newPost, ...old];
        });
      }

      // Only invalidate the specific posts query we're using
      queryClient.invalidateQueries({
        queryKey: ["/api/posts", "team-posts"],
        exact: false // This will match all variations including different teamIds
      });

      // Invalidate post limits - use exact: false to match all variations of the counts query
      queryClient.invalidateQueries({
        queryKey: ["/api/posts/counts"],
        exact: false
      });

      // If this was a prayer post, also invalidate the prayer requests cache
      if (newPost.type === "prayer") {
        queryClient.invalidateQueries({ queryKey: ["/api/posts/prayer-requests"] });
      }

      // Then use predicate for any other post-related queries we might have missed
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as (string | number)[];
          if (queryKey[0] === "/api/posts") {
            return true;
          }
          return false;
        }
      });

      // Display success toast
      toast({
        title: "Post Created",
        description: `Your ${newPost.type.replace('_', ' ')} post was created successfully.`,
      });
    },
    onError: (error: any, _: any, context: any) => {
      // Restore previous posts data if we have it
      if (context?.previousPosts) {
        queryClient.setQueryData(["/api/posts", "team-posts"], context.previousPosts);
      }
      console.error("Create post mutation error:", error);
      toast({
        title: "Error Creating Post",
        description: error instanceof Error ? error.message : "Failed to create post",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: CreatePostForm) => {
    console.log("============ FORM SUBMIT DEBUG START ============");
    console.log("🔥 onSubmit called with data:", { type: data.type, hasMediaUrl: !!data.mediaUrl, content: data.content?.substring(0, 50) });
    console.log("🔥 Form errors:", form.formState.errors);
    console.log("🔥 [SCOPE DEBUG] Form data received in onSubmit:", {
      postScope: data.postScope,
      targetOrganizationId: data.targetOrganizationId,
      targetGroupId: data.targetGroupId,
      targetTeamId: data.targetTeamId
    });
    console.log("🔥 [SCOPE DEBUG] Local state values:", {
      localPostScope: postScope
    });
    console.log("🔥 [SCOPE DEBUG] All form values from getValues():", form.getValues());
    console.log("============ FORM SUBMIT DEBUG END ============");
    data.postDate = selectedDate;
    createPostMutation.mutate(data);
  };

  // Check if user has posted intro video but doesn't have a team
  // In this case, disable posting until they join a team (unless they delete their intro video)
  const isPostingDisabled = hasAnyPosts && !user?.teamId;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        form.reset();
        setImagePreview(null);
        setVideoThumbnail(null);
        setSelectedMediaType(null);
        setSelectedExistingVideo(null);
        setPostScope("my_team");
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          size="icon" 
          className="h-10 w-10 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isPostingDisabled}
          title={isPostingDisabled ? "Join a team to post more content" : "Create a post"}
        >
          <Plus className="h-16 w-16 text-black font-extrabold" />
        </Button>
      </DialogTrigger>
      <DialogContent className="h-screen overflow-y-auto pb-32 sm:pb-28 pt-8">
        <div className="flex justify-between items-center mb-4 px-2">
          <Button
            onClick={() => setOpen(false)}
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label="Close"
          >
            <span className="text-2xl font-bold">×</span>
          </Button>
          <DialogTitle className="text-center flex-1 mr-8">Create Post</DialogTitle>
          <DialogDescription className="sr-only">
            Create a new post to share with your team
          </DialogDescription>
        </div>
        <Form {...form}>
          <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex flex-col">
            <FormField
              control={form.control}
              name="postDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Post Date</FormLabel>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
                        >
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[999999999]" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (date) {
                            setSelectedDate(date);
                            field.onChange(date);
                            refetch();
                            setDatePickerOpen(false);
                          }
                        }}
                        disabled={(date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const checkDate = new Date(date);
                          checkDate.setHours(0, 0, 0, 0);

                          // Disable future dates for everyone
                          if (checkDate > today) {
                            return true;
                          }

                          // For competitive groups, only allow today's date
                          if (isCompetitive === true) {
                            return checkDate.getTime() !== today.getTime();
                          }

                          // For non-competitive groups, allow all past/present dates
                          return false;
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {isCompetitive === true && (
                    <p className="text-xs text-muted-foreground">
                      Competitive groups must post on the current date
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Only show Type field if hideTypeField is false */}
            {!hideTypeField && (
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset selected media type when changing post type
                        setSelectedMediaType(null);
                        setImagePreview(null);
                        setVideoThumbnail(null);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="food" disabled={isPostTypeDisabled('food') || !hasAnyPosts}>
                          Food {getRemainingMessage('food')}
                        </SelectItem>
                        <SelectItem value="workout" disabled={isPostTypeDisabled('workout') || !hasAnyPosts}>
                          Workout {getRemainingMessage('workout')}
                        </SelectItem>
                        <SelectItem value="scripture" disabled={isPostTypeDisabled('scripture') || !hasAnyPosts}>
                          Scripture {getRemainingMessage('scripture')}
                        </SelectItem>
                        <SelectItem value="memory_verse" disabled={isPostTypeDisabled('memory_verse') || !hasAnyPosts}>
                          Memory Verse {getRemainingMessage('memory_verse')}
                        </SelectItem>
                        {!hasAnyPosts ? (
                          <SelectItem value="introductory_video">
                            Intro Video {getRemainingMessage('introductory_video')}
                          </SelectItem>
                        ) : (
                          <SelectItem value="miscellaneous">
                            Miscellaneous {getRemainingMessage('miscellaneous')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Post Scope Selector - Only show for Admin and Group Admin when posting Miscellaneous */}
            {(user?.isAdmin || user?.isGroupAdmin) && form.watch("type") === "miscellaneous" && (
              <>
                <FormField
                  control={form.control}
                  name="postScope"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Post To</FormLabel>
                      <Select
                        value={postScope}
                        onValueChange={(value: any) => {
                          setPostScope(value);
                          field.onChange(value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select audience" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {user?.isAdmin && <SelectItem value="everyone">Everyone</SelectItem>}
                          {user?.isAdmin && <SelectItem value="organization">Organization</SelectItem>}
                          <SelectItem value="group">Group</SelectItem>
                          <SelectItem value="team">Team</SelectItem>
                          <SelectItem value="my_team">My Team (Default)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Organization Selector */}
                {postScope === "organization" && user?.isAdmin && (
                  <FormField
                    control={form.control}
                    name="targetOrganizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Organization</FormLabel>
                        <Select
                          value={field.value?.toString()}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose organization" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {organizations.map((org: any) => (
                              <SelectItem key={org.id} value={org.id.toString()}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Group Selector */}
                {postScope === "group" && (
                  <FormField
                    control={form.control}
                    name="targetGroupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Group</FormLabel>
                        <Select
                          value={field.value?.toString()}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose group" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {groups
                              .filter((group: any) => user?.isAdmin || group.id === user?.adminGroupId)
                              .map((group: any) => (
                                <SelectItem key={group.id} value={group.id.toString()}>
                                  {group.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Team Selector */}
                {postScope === "team" && (
                  <FormField
                    control={form.control}
                    name="targetTeamId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Team</FormLabel>
                        <Select
                          value={field.value?.toString()}
                          onValueChange={(value) => {
                            console.log("🎯 Team selected:", { rawValue: value, parsedValue: parseInt(value), fieldValue: field.value });
                            field.onChange(parseInt(value));
                            console.log("🎯 After onChange, field value:", field.value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose team" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teams
                              .filter((team: any) => {
                                if (user?.isAdmin) return true;
                                if (user?.isGroupAdmin) {
                                  // Group admins can only see teams in their group
                                  return team.groupId === user.adminGroupId;
                                }
                                return false;
                              })
                              .sort((a: any, b: any) => a.name.localeCompare(b.name))
                              .map((team: any) => (
                                <SelectItem key={team.id} value={team.id.toString()}>
                                  {team.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}

            {(form.watch("type") === "food" || form.watch("type") === "workout" || form.watch("type") === "miscellaneous" || form.watch("type") === "memory_verse" || form.watch("type") === "prayer" || form.watch("type") === "introductory_video") && (
              <FormField
                control={form.control}
                name="mediaUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {(form.watch("type") === "memory_verse") ? "Video" :
                       (form.watch("type") === "introductory_video") ? "Intro Video" :
                       (form.watch("type") === "miscellaneous" && !hasAnyPosts) ? "Intro Video" :
                       (form.watch("type") === "miscellaneous" || form.watch("type") === "prayer") ? "Media" : "Image"}
                    </FormLabel>
                    <div className="space-y-4">
                      {form.watch("type") === "memory_verse" && (
                        <div className="space-y-4">
                          {/* Simplified upload button for memory verse */}
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full py-8"
                            onClick={() => {
                              if (videoInputRef.current) {
                                videoInputRef.current.click();
                              }
                            }}
                          >
                            <div className="flex flex-col items-center justify-center text-center">
                              <span>Select video</span>
                            </div>
                          </Button>

                          {/* Hidden video input file */}
                          <Input
                            type="file"
                            accept="video/*"
                            ref={videoInputRef}
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 100 * 1024 * 1024) { // 100MB limit
                                  toast({
                                    title: "Error",
                                    description: "Video file is too large. Maximum size is 100MB.",
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                // For video, create a preview and store the file reference
                                const videoUrl = URL.createObjectURL(file);
                                setImagePreview(videoUrl);

                                // Generate a thumbnail for the video
                                console.log("Starting thumbnail generation for video:", file.name, file.type);
                                setVideoThumbnail(null); // Reset thumbnail state
                                
                                try {
                                  const thumbnailUrl = await generateVideoThumbnail(file);
                                  console.log("Thumbnail generation result:", thumbnailUrl ? "SUCCESS" : "FAILED");
                                  if (thumbnailUrl) {
                                    setVideoThumbnail(thumbnailUrl);
                                    console.log("Generated video thumbnail successfully:", thumbnailUrl.substring(0, 50) + "...");
                                  } else {
                                    console.log("Failed to generate video thumbnail");
                                  }
                                } catch (error) {
                                  console.error("Error in thumbnail generation:", error);
                                }

                                // Important: we need to set the field value to a marker so we know to use the video file
                                const marker = "VIDEO_FILE_UPLOAD";
                                field.onChange(marker);

                                // Log detailed information about the selected file
                                console.log("Memory verse video file selected:", {
                                  name: file.name,
                                  type: file.type,
                                  size: file.size,
                                  sizeInMB: (file.size / (1024 * 1024)).toFixed(2) + "MB",
                                  fieldValue: marker
                                });

                                // Log video selection without showing toast
                                console.log(`Video selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <FormControl>
                        {form.watch("type") !== "memory_verse" && (
                          <>
                            {/* Hide image button for intro video (first post) */}
                            {hasAnyPosts && (
                              <>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    // If Miscellaneous post and video already selected, show warning
                                    if (form.watch("type") === "miscellaneous" && selectedMediaType === "video") {
                                      toast({
                                        title: "Cannot select both image and video",
                                        description: "Please remove the video first before selecting an image.",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    fileInputRef.current?.click();
                                  }}
                                  variant="outline"
                                  className="w-full"
                                >
                                  Select Image
                                </Button>
                                <Input
                                  type="file"
                                  accept="image/*"
                                  ref={fileInputRef}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = async () => {
                                        try {
                                          if (file.type.startsWith("video/")) {
                                            setImagePreview(reader.result as string);
                                          } else {
                                            const compressed = await compressImage(reader.result as string);
                                            setImagePreview(compressed);
                                            field.onChange(compressed);

                                            // Set media type to image
                                            if (form.watch("type") === "miscellaneous") {
                                              setSelectedMediaType("image");
                                            }
                                          }
                                        } catch (error) {
                                          console.error('Error compressing image:', error);
                                          toast({
                                            title: "Error",
                                            description: "Failed to process image. Please try again.",
                                            variant: "destructive",
                                          });
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </>
                            )}

                            {/* Add Select Video button for Introductory Video, Miscellaneous and Prayer Request post types */}
                            {(form.watch("type") === "introductory_video" || form.watch("type") === "miscellaneous" || form.watch("type") === "prayer") && (
                              <div className={hasAnyPosts ? "mt-3" : ""}>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    // If Miscellaneous post and image already selected, show warning
                                    if (form.watch("type") === "miscellaneous" && selectedMediaType === "image" && hasAnyPosts) {
                                      toast({
                                        title: "Cannot select both image and video",
                                        description: "Please remove the image first before selecting a video.",
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    videoInputRef.current?.click();
                                  }}
                                  variant="outline"
                                  className="w-full"
                                >
                                  {!hasAnyPosts ? "Select Intro Video" : "Select Video"}
                                </Button>

                                {/* Hidden video input field for miscellaneous posts */}
                                <Input
                                  type="file"
                                  accept="video/*"
                                  ref={videoInputRef}
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      // Apply the same file size limit as memory verse videos
                                      if (file.size > 100 * 1024 * 1024) { // 100MB limit
                                        toast({
                                          title: "Error",
                                          description: "Video file is too large. Maximum size is 100MB.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }

                                      // For video, create a preview and set media type
                                      const videoUrl = URL.createObjectURL(file);
                                      setImagePreview(videoUrl);
                                      setSelectedMediaType("video");

                                      // Generate a thumbnail for the video
                                      generateVideoThumbnail(file).then(thumbnailUrl => {
                                        if (thumbnailUrl) {
                                          setVideoThumbnail(thumbnailUrl);
                                          console.log("Generated video thumbnail for miscellaneous post");
                                        }
                                      });

                                      // Set the field value to a marker so we know to use the video file
                                      const marker = "VIDEO_FILE_UPLOAD";
                                      field.onChange(marker);

                                      // Log detailed information about the selected file
                                      console.log("Miscellaneous video file selected:", {
                                        name: file.name,
                                        type: file.type,
                                        size: file.size,
                                        sizeInMB: (file.size / (1024 * 1024)).toFixed(2) + "MB",
                                        selectedMediaType: "video",
                                        fieldValue: marker
                                      });

                                      // Log video selection without showing toast
                                      console.log(`Video selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </FormControl>
                      {(imagePreview || videoThumbnail) && (
                        <div className="mt-2">
                          {/* Display video thumbnails for memory verse posts, introductory video posts, miscellaneous video posts, or prayer video posts */}
                          {(form.watch("type") === "memory_verse" || form.watch("type") === "introductory_video" || (form.watch("type") === "miscellaneous" && selectedMediaType === "video") || (form.watch("type") === "prayer" && selectedMediaType === "video")) && (
                            <div className="mt-2">
                              {videoThumbnail ? (
                                <div>
                                  <img
                                    src={videoThumbnail}
                                    alt="Video Thumbnail"
                                    className="max-h-40 rounded-md border border-gray-300"
                                  />
                                  <p className="text-sm text-gray-600 mt-1">Video thumbnail preview</p>
                                </div>
                              ) : (
                                <div className="max-h-40 flex items-center justify-center border border-gray-300 rounded-md bg-gray-50 p-8">
                                  <p className="text-sm text-gray-500">Generating thumbnail...</p>
                                </div>
                              )}
                            </div>
                          )}
                          {/* Display regular images for other post types or miscellaneous image posts */}
                          {((form.watch("type") !== "memory_verse" && form.watch("type") !== "introductory_video" && form.watch("type") !== "miscellaneous" && !(form.watch("type") === "prayer" && selectedMediaType === "video")) ||
                            (form.watch("type") === "miscellaneous" && selectedMediaType === "image")) && imagePreview && (
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="max-h-40 rounded-md"
                            />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setImagePreview(null);
                              setVideoThumbnail(null);
                              field.onChange(null);
                              // Reset media type for miscellaneous posts
                              if (form.watch("type") === "miscellaneous") {
                                setSelectedMediaType(null);
                              }
                            }}
                          >
                            Remove {form.watch("type") === "memory_verse" || form.watch("type") === "introductory_video" || (form.watch("type") === "miscellaneous" && videoThumbnail) || (form.watch("type") === "prayer" && videoThumbnail) ? "Video" : "Image"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter post content"
                      value={field.value || ''}
                      className="min-h-[30px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-center mt-6 mb-20">
              <Button
                type="submit"
                form="create-post-form"
                variant="default"
                className="w-[calc(95%-2rem)] max-w-full bg-violet-700 hover:bg-violet-800 z-10 sm:w-full"
                disabled={createPostMutation.isPending || (form.watch("type") !== "prayer" && form.watch("type") !== "introductory_video" && !canPost[form.watch("type") as keyof typeof canPost])}
              >
                {createPostMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Post
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Generate a thumbnail from a video file
// Convert a data URL to a Blob object
function dataURLToBlob(dataURL: string): Blob {
  // Split the data URL to get the content type and base64 data
  const parts = dataURL.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;

  // Create an array buffer with the binary data
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  // Create a Blob from the array buffer
  return new Blob([uInt8Array], { type: contentType });
}

async function generateVideoThumbnail(videoFile: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      console.log('🎬 Starting video thumbnail generation for:', videoFile.name, videoFile.type);

      // Create a video element
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;

      let hasResolved = false;

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          console.warn('⏰ Video thumbnail generation timed out after 10 seconds');
          hasResolved = true;
          URL.revokeObjectURL(video.src);
          resolve(null);
        }
      }, 10000); // 10 second timeout

      // Create a URL for the video file
      const videoUrl = URL.createObjectURL(videoFile);

      // Function to generate thumbnail from current frame
      const generateThumbnailFromCurrentFrame = () => {
        if (hasResolved) return false;

        try {
          console.log('📸 Attempting to capture frame at currentTime:', video.currentTime);

          // Ensure video has valid dimensions
          if (!video.videoWidth || !video.videoHeight) {
            console.warn('⚠️ Video dimensions not available yet');
            return false;
          }

          const canvas = document.createElement('canvas');
          const targetWidth = 400; // Fixed width for consistency
          const aspectRatio = video.videoHeight / video.videoWidth;
          canvas.width = targetWidth;
          canvas.height = Math.round(targetWidth * aspectRatio);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.error('❌ Failed to get canvas context');
            return false;
          }

          // Clear canvas and draw the current frame
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Convert canvas to data URL with higher quality
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.9);

          if (thumbnailUrl && thumbnailUrl.length > 1000) { // More stringent validation
            console.log('✅ Video thumbnail generated successfully! Size:', thumbnailUrl.length, 'chars');
            hasResolved = true;
            clearTimeout(timeout);
            URL.revokeObjectURL(videoUrl);
            resolve(thumbnailUrl);
            return true;
          } else {
            console.warn('⚠️ Generated thumbnail seems invalid, size:', thumbnailUrl?.length);
            return false;
          }
        } catch (error) {
          console.error('❌ Error generating thumbnail:', error);
          return false;
        }
      };

      // When metadata is loaded
      video.onloadedmetadata = () => {
        console.log('📋 Video metadata loaded:', {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
        
        // Seek to 1 second (or 10% of duration, whichever is less)
        const seekTime = Math.min(1, video.duration * 0.1);
        console.log(`🔍 Seeking to ${seekTime} seconds for thumbnail`);
        video.currentTime = seekTime;
      };

      // When seeking completes
      video.onseeked = () => {
        console.log('✨ Video seeking completed at', video.currentTime);
        setTimeout(() => {
          if (!hasResolved) {
            generateThumbnailFromCurrentFrame();
          }
        }, 100);
      };

      // Handle errors
      video.onerror = (e) => {
        console.error('❌ Error loading video for thumbnail:', e);
        if (!hasResolved) {
          hasResolved = true;
          clearTimeout(timeout);
          URL.revokeObjectURL(videoUrl);
          resolve(null);
        }
      };

      // Set the video source and start loading
      console.log('🚀 Setting video source and starting load');
      video.src = videoUrl;
      video.load();

    } catch (error) {
      console.error('💥 Error setting up video thumbnail generation:', error);
      resolve(null);
    }
  });
}

async function compressImage(imageDataUrl: string, maxWidth = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}