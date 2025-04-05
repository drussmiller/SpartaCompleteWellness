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

export function CreatePostDialog({ remaining: propRemaining }: { remaining: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { canPost, counts, refetch, remaining, memoryVerseWeekCount } = usePostLimits(selectedDate);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null); 
  const queryClient = useQueryClient();
  const [selectedExistingVideo, setSelectedExistingVideo] = useState<string | null>(null);
  
  // Define the type for memory verse video objects
  type MemoryVerseVideo = {
    id: number;
    content: string;
    mediaUrl: string;
    createdAt: string;
  };

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "food",
      content: "",
      mediaUrl: null,
      points: 3,
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
            if (data.type === 'memory_verse') {
              // For memory verse, we need to handle video files
              if (videoInputRef.current && videoInputRef.current.files && videoInputRef.current.files.length > 0) {
                const videoFile = videoInputRef.current.files[0];
                
                // Create a new File object with a fixed name and the correct MIME type
                const renamedFile = new File(
                  [videoFile], 
                  `memory_verse_${Date.now()}.${videoFile.name.split('.').pop() || 'mp4'}`,
                  { type: videoFile.type || 'video/mp4' }
                );
                
                // Append the actual video file to the form data
                formData.append("image", renamedFile);
                
                // Add logging to verify file is being included
                console.log("Uploading memory verse video file:", {
                  originalName: videoFile.name,
                  newName: renamedFile.name,
                  type: renamedFile.type, 
                  size: renamedFile.size,
                  formDataEntries: Array.from(formData.entries()).map(entry => {
                    const [key, value] = entry;
                    if (key === 'image') {
                      return [key, `File object: ${(value as File).name}, type: ${(value as File).type}`];
                    }
                    return [key, typeof value === 'string' ? value.substring(0, 30) + '...' : '[non-string]'];
                  })
                });
              } else if (!selectedExistingVideo) {
                console.error("Memory verse post missing video file");
                throw new Error("No video file selected");
              }
            } else {
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

        const postData = {
          type: data.type,
          content: data.content?.trim() || '',
          points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : data.type === "miscellaneous" ? 0 : 3,
          createdAt: data.postDate ? data.postDate.toISOString() : selectedDate.toISOString()
        };

        console.log("Post data prepared:", { 
          type: postData.type, 
          contentLength: postData.content.length,
          hasImage: !!data.mediaUrl 
        });

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
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/posts"] });
      const previousPosts = queryClient.getQueryData(["/api/posts"]);

      const optimisticPost = {
        id: Date.now(), 
        type: data.type,
        content: data.content,
        mediaUrl: imagePreview,
        createdAt: data.postDate || new Date(),
        author: user,
        points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : data.type === "miscellaneous" ? 0 : 3
      };

      queryClient.setQueryData(["/api/posts"], (old: any[] = []) => [optimisticPost, ...old]);

      return { previousPosts };
    },
    onSuccess: (newPost) => {
      form.reset();
      setOpen(false);
      setImagePreview(null);

      queryClient.setQueryData(["/api/posts"], (old: any[] = []) => {
        return old.map(post => post.id === Date.now() ? newPost : post);
      });

      queryClient.invalidateQueries({ queryKey: ["/api/posts/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/stats"] });
    },
    onError: (error, _, context) => {
      queryClient.setQueryData(["/api/posts"], context?.previousPosts);
      console.error("Create post mutation error:", error);
      toast({
        title: "Error Creating Post",
        description: error instanceof Error ? error.message : "Failed to create post",
        variant: "destructive",
      });
    },
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
        <DialogDescription className="text-center">
          Share your wellness journey with your team
        </DialogDescription>

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
                      <option value="miscellaneous">
                        Miscellaneous {getRemainingMessage('miscellaneous')}
                      </option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(form.watch("type") === "food" || form.watch("type") === "workout" || form.watch("type") === "miscellaneous" || form.watch("type") === "memory_verse") && (
              <FormField
                control={form.control}
                name="mediaUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch("type") === "memory_verse" ? "Video Recording or Upload" : "Image"}
                    </FormLabel>
                    <div className="space-y-4">
                      {form.watch("type") === "memory_verse" && (
                        <div className="space-y-4">
                          {/* Option to record a new video */}
                          <Button
                            type="button"
                            onClick={() => videoInputRef.current?.click()}
                            variant="outline"
                            className="w-full"
                          >
                            Record/Upload New Video
                          </Button>
                          
                          {/* Option to select from existing videos */}
                          {existingMemoryVerseVideos && existingMemoryVerseVideos.length > 0 && (
                            <div className="space-y-2">
                              <FormLabel>Or select from your existing videos:</FormLabel>
                              <Select 
                                onValueChange={(value) => {
                                  // Clear file input if user selects an existing video
                                  if (videoInputRef.current) {
                                    videoInputRef.current.value = '';
                                  }
                                  
                                  // Find the selected video from the list
                                  const selectedVideo = existingMemoryVerseVideos.find(v => v.id.toString() === value);
                                  if (selectedVideo) {
                                    setSelectedExistingVideo(selectedVideo.mediaUrl);
                                    setImagePreview(selectedVideo.mediaUrl);
                                    
                                    // Set an identifier for the existing video
                                    field.onChange(`EXISTING_VIDEO:${selectedVideo.id}`);
                                    
                                    console.log("Selected existing video:", {
                                      id: selectedVideo.id,
                                      url: selectedVideo.mediaUrl,
                                      content: selectedVideo.content
                                    });
                                  }
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select a previous video" />
                                </SelectTrigger>
                                <SelectContent>
                                  {existingMemoryVerseVideos.map((video) => (
                                    <SelectItem key={video.id} value={video.id.toString()}>
                                      {new Date(video.createdAt).toLocaleDateString()} - {video.content.substring(0, 20)}
                                      {video.content.length > 20 ? '...' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          {/* Hidden video input file */}
                          <Input
                            type="file"
                            accept="video/*"
                            ref={videoInputRef}
                            capture="user"
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
                                
                                // Clear any selected existing video
                                setSelectedExistingVideo(null);

                                // For video, create a preview and store the file reference
                                const videoUrl = URL.createObjectURL(file);
                                setImagePreview(videoUrl);
                                // Important: we need to set the field value to a marker so we know to use the video file
                                field.onChange("VIDEO_UPLOAD_MARKER"); // Use a marker instead of the blob URL
                                console.log("Video file selected:", {
                                  name: file.name,
                                  type: file.type,
                                  size: file.size
                                });
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
                              onClick={() => fileInputRef.current?.click()}
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
                      </FormControl>
                      {imagePreview && (
                        <div className="mt-2">
                          {form.watch("type") === "memory_verse" && imagePreview && (
                            <video 
                              src={imagePreview} 
                              controls
                              controlsList="nodownload"
                              className="w-full max-h-60 rounded-md object-contain bg-black"
                              preload="metadata"
                            />
                          )}
                          {form.watch("type") !== "memory_verse" && imagePreview && (
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
                              field.onChange(null);
                            }}
                          >
                            Remove {form.watch("type") === "memory_verse" ? "Video" : "Image"}
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
                disabled={createPostMutation.isPending || !canPost[form.watch("type") as keyof typeof canPost]}
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