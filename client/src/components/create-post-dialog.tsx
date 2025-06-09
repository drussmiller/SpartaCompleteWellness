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
  
  // Define the type for memory verse video objects
  type MemoryVerseVideo = {
    id: number;
    content: string;
    mediaUrl: string;
    createdAt: string;
  };

  // Use defaultType if provided, otherwise use initialType
  const actualType = defaultType || initialType;
  
  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: actualType,
      content: "",
      mediaUrl: null,
      points: actualType === "prayer" ? 0 : actualType === "memory_verse" ? 10 : 3,
      postDate: selectedDate
    }
  });
  
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
            // Handle memory verse and miscellaneous post video uploads
            if ((data.type === 'memory_verse' || (data.type === 'miscellaneous' && selectedMediaType === 'video')) && 
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
                    !(data.type === 'miscellaneous' && selectedMediaType === 'video')) {
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
          createdAt: data.postDate ? data.postDate.toISOString() : selectedDate.toISOString()
        };

        console.log("Post data prepared:", { 
          type: postData.type, 
          contentLength: postData.content.length,
          hasImage: !!data.mediaUrl 
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
        
        formData.append("data", JSON.stringify(postData));
        
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

      // First directly invalidate the most common query keys
      // This is more explicit and reliable than using predicates
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "team-posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/stats"] });
      
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
    data.postDate = selectedDate;
    createPostMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        form.reset();
        setImagePreview(null);
        setVideoThumbnail(null);
        setSelectedMediaType(null);
        setSelectedExistingVideo(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-10 w-10 bg-gray-200 hover:bg-gray-300">
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
        </div>
        <Form {...form}>
          <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex flex-col">
            <FormField
              control={form.control}
              name="postDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Post Date</FormLabel>
                  <Popover>
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
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (date) {
                            setSelectedDate(date);
                            field.onChange(date);
                          }
                        }}
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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
                    <FormControl>
                      <select
                        {...field}
                        className="w-full rounded-md border border-input bg-background px-3 py-2"
                        onChange={(e) => {
                          field.onChange(e);
                          // Reset selected media type when changing post type
                          setSelectedMediaType(null);
                          setImagePreview(null);
                          setVideoThumbnail(null);
                        }}
                      >
                        <option value="food" disabled={isPostTypeDisabled('food')}>
                          Food {getRemainingMessage('food')}
                        </option>
                        <option value="workout" disabled={isPostTypeDisabled('workout')}>
                          Workout {getRemainingMessage('workout')}
                        </option>
                        <option value="scripture" disabled={isPostTypeDisabled('scripture')}>
                          Scripture {getRemainingMessage('scripture')}
                        </option>
                        <option value="memory_verse" disabled={isPostTypeDisabled('memory_verse')}>
                          Memory Verse {getRemainingMessage('memory_verse')}
                        </option>
                        {/* Remove Prayer Request option entirely - will be handled on its own page */}
                        <option value="miscellaneous">
                          Miscellaneous {getRemainingMessage('miscellaneous')}
                        </option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(form.watch("type") === "food" || form.watch("type") === "workout" || form.watch("type") === "miscellaneous" || form.watch("type") === "memory_verse" || form.watch("type") === "prayer") && (
              <FormField
                control={form.control}
                name="mediaUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {(form.watch("type") === "memory_verse") ? "Video" : 
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
                            onChange={(e) => {
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
                                generateVideoThumbnail(file).then(thumbnailUrl => {
                                  if (thumbnailUrl) {
                                    setVideoThumbnail(thumbnailUrl);
                                    console.log("Generated video thumbnail");
                                  }
                                });
                                
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
                            
                            {/* Add Select Video button for Miscellaneous and Prayer Request post types */}
                            {(form.watch("type") === "miscellaneous" || form.watch("type") === "prayer") && (
                              <div className="mt-3">
                                <Button
                                  type="button"
                                  onClick={() => {
                                    // If Miscellaneous post and image already selected, show warning
                                    if (form.watch("type") === "miscellaneous" && selectedMediaType === "image") {
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
                                  Select Video
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
                      {imagePreview && (
                        <div className="mt-2">
                          {/* Display video thumbnails for memory verse posts or miscellaneous video posts */}
                          {(form.watch("type") === "memory_verse" || (form.watch("type") === "miscellaneous" && selectedMediaType === "video")) && videoThumbnail && (
                            <div className="mt-2">
                              <img 
                                src={videoThumbnail}
                                alt="Video Thumbnail"
                                className="max-h-40 rounded-md border border-gray-300"
                              />
                            </div>
                          )}
                          {/* Display regular images for other post types or miscellaneous image posts */}
                          {((form.watch("type") !== "memory_verse" && form.watch("type") !== "miscellaneous") || 
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
                            Remove {form.watch("type") === "memory_verse" || (form.watch("type") === "miscellaneous" && videoThumbnail) ? "Video" : "Image"}
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
                disabled={createPostMutation.isPending || (form.watch("type") !== "prayer" && !canPost[form.watch("type") as keyof typeof canPost])}
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
      console.log('Starting video thumbnail generation for:', videoFile.name, videoFile.type);
      
      // Create a video element
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.warn('Video thumbnail generation timed out');
        URL.revokeObjectURL(video.src);
        resolve(null);
      }, 10000); // 10 second timeout
      
      // Create a URL for the video file
      const videoUrl = URL.createObjectURL(videoFile);
      
      // When video metadata is loaded, seek to a frame
      video.onloadedmetadata = () => {
        console.log('Video metadata loaded:', {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
        
        // Seek to 1 second or 10% of duration, whichever is smaller
        const seekTime = Math.min(1, video.duration * 0.1);
        video.currentTime = seekTime;
        console.log('Seeking to time:', seekTime);
      };
      
      // When seeking completes, capture the thumbnail
      video.onseeked = () => {
        try {
          console.log('Video seek completed, generating thumbnail');
          
          // Create a canvas with video dimensions
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          
          // Draw the current frame to the canvas
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert canvas to data URL
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            console.log('Video thumbnail generated successfully');
            
            // Clean up
            clearTimeout(timeout);
            URL.revokeObjectURL(videoUrl);
            
            // Return the thumbnail
            resolve(thumbnailUrl);
          } else {
            console.error('Failed to get canvas context');
            clearTimeout(timeout);
            URL.revokeObjectURL(videoUrl);
            resolve(null);
          }
        } catch (error) {
          console.error('Error generating thumbnail in onseeked:', error);
          clearTimeout(timeout);
          URL.revokeObjectURL(videoUrl);
          resolve(null);
        }
      };
      
      // Handle errors
      video.onerror = (e) => {
        console.error('Error loading video for thumbnail:', e);
        clearTimeout(timeout);
        URL.revokeObjectURL(videoUrl);
        resolve(null);
      };
      
      // Handle cases where seeking might not trigger
      video.oncanplay = () => {
        console.log('Video can play, checking if seeking happened');
        // If we haven't generated a thumbnail yet, try to capture current frame
        setTimeout(() => {
          if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
              
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
                
                console.log('Fallback thumbnail generated from canplay');
                clearTimeout(timeout);
                URL.revokeObjectURL(videoUrl);
                resolve(thumbnailUrl);
              }
            } catch (error) {
              console.log('Fallback thumbnail generation failed:', error);
            }
          }
        }, 500);
      };
      
      // Set the video source and start loading
      video.src = videoUrl;
      video.load();
      
    } catch (error) {
      console.error('Error setting up video thumbnail generation:', error);
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