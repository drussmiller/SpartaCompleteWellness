import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, CalendarIcon, Loader2, Video, Upload, Utensils, Dumbbell, Book, Heart, MessageSquare } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";


type CreatePostForm = z.infer<typeof insertPostSchema> & {
  postDate?: Date;
};

type PostType = "food" | "workout" | "scripture" | "memory_verse" | "miscellaneous" | "prayer" | "comment";

interface CreatePostDialogProps {
  remaining: Record<string, number>;
  initialType?: PostType;
}

export function CreatePostDialog({ 
  remaining: propRemaining, 
  initialType = "food",
}: CreatePostDialogProps) {
  const { user } = useAuth();
  
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<PostType>(
    initialType || (user?.teamId ? "food" : "miscellaneous")
  );
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Early return if user is not loaded yet - moved after state initialization
  if (!user) {
    return null;
  }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  
  // Define imagePreview state that was missing but referenced later
  const imagePreview = previewImage;

  // Check if user has already posted an introduction (miscellaneous post)
  const { data: userIntroductionPosts } = useQuery({
    queryKey: ["/api/posts/user-introduction", user?.id],
    queryFn: async () => {
      if (!user?.id || user?.teamId) return [];
      const response = await apiRequest("GET", `/api/posts?userId=${user.id}&type=miscellaneous`);
      if (!response.ok) throw new Error("Failed to fetch user posts");
      return response.json();
    },
    enabled: !!user?.id && !user?.teamId,
  });

  const hasPostedIntroduction = userIntroductionPosts && userIntroductionPosts.length > 0;

  const postTypes: { value: PostType; label: string; icon: React.ReactNode; description: string }[] = user?.teamId ? [
    {
      value: "food",
      label: "Food",
      icon: <Utensils className="h-4 w-4" />,
      description: "Share your meals and nutrition"
    },
    {
      value: "workout",
      label: "Workout",
      icon: <Dumbbell className="h-4 w-4" />,
      description: "Post your exercise routine"
    },
    {
      value: "scripture",
      label: "Scripture",
      icon: <Book className="h-4 w-4" />,
      description: "Share Bible verses and reflections"
    },
    {
      value: "memory_verse",
      label: "Memory Verse",
      icon: <Heart className="h-4 w-4" />,
      description: "Recite a memorized Bible verse"
    },
    {
      value: "miscellaneous",
      label: "Miscellaneous",
      icon: <MessageSquare className="h-4 w-4" />,
      description: "General posts and updates"
    }
  ] : [
    {
      value: "miscellaneous",
      label: "Introduction",
      icon: <MessageSquare className="h-4 w-4" />,
      description: "Post an introduction video of why you want to join and about yourself"
    }
  ];

  const { toast } = useToast();
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { canPost, counts, refetch, remaining, memoryVerseWeekCount } = usePostLimits(selectedDate);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null); 
  const [selectedExistingVideo, setSelectedExistingVideo] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<"image" | "video" | null>(null);

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
      type: selectedType,
      content: "",
      mediaUrl: null,
      points: selectedType === "prayer" ? 0 : selectedType === "memory_verse" ? 10 : 3,
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
  function isPostTypeDisabled(type: PostType) {
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
      setPreviewImage(null);
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

      // Only invalidate the specific posts query we're using
      queryClient.invalidateQueries({ queryKey: ["/api/posts", "team-posts"] });

      // Invalidate post limits only once with specific key
      const today = new Date();
      const tzOffset = today.getTimezoneOffset();
      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/counts", today.toISOString(), tzOffset],
        exact: true 
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
    data.postDate = selectedDate;
    createPostMutation.mutate(data);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine the expected file type based on the selected post type
    const isVideoPost = selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous");
    const expectedFileType = isVideoPost ? "video" : "image";
    const maxSize = isVideoPost ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 100MB for video, 10MB for image

    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Please upload a file smaller than ${isVideoPost ? '100MB' : '10MB'}.`,
        variant: "destructive",
      });
      e.target.value = ""; // Clear the input
      return;
    }

    if (isVideoPost && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file.",
        variant: "destructive",
      });
      e.target.value = ""; // Clear the input
      return;
    } else if (!isVideoPost && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file.",
        variant: "destructive",
      });
      e.target.value = ""; // Clear the input
      return;
    }

    // Handle video file selection
    if (isVideoPost) {
      const videoUrl = URL.createObjectURL(file);
      setPreviewImage(videoUrl);
      setImage(file); // Store the file itself
      setSelectedMediaType("video");

      // Generate a thumbnail for the video
      console.log("Starting thumbnail generation for video:", file.name, file.type);
      setVideoThumbnail(null); // Reset thumbnail state
      generateVideoThumbnail(file).then(thumbnailUrl => {
        console.log("Thumbnail generation result:", thumbnailUrl ? "SUCCESS" : "FAILED");
        if (thumbnailUrl) {
          setVideoThumbnail(thumbnailUrl);
          console.log("Generated video thumbnail successfully:", thumbnailUrl.substring(0, 50) + "...");
        } else {
          console.log("Failed to generate video thumbnail");
        }
      }).catch(error => {
        console.error("Error in thumbnail generation promise:", error);
      });

      // Set the form field value to a marker indicating a video file is attached
      form.setValue("mediaUrl", "VIDEO_FILE_ATTACHED");
      console.log(`Video file selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    } else {
      // Handle image file selection
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const compressed = await compressImage(reader.result as string);
          setPreviewImage(compressed);
          setImage(file); // Store the file itself
          setSelectedMediaType("image");
          form.setValue("mediaUrl", compressed); // Set form value to the compressed image data URL
          console.log(`Image file selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
        } catch (error) {
          console.error('Error compressing image:', error);
          toast({
            title: "Error",
            description: "Failed to process image. Please try again.",
            variant: "destructive",
          });
          e.target.value = ""; // Clear the input
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper function to determine if the submit button should be enabled
  const canCreatePost = () => {
    if (!content.trim()) return false;
    if (selectedType === "memory_verse" && !image && !selectedExistingVideo) return false;
    if ((selectedType === "food" || selectedType === "workout") && !image) return false;
    if (!user?.teamId && selectedType === "miscellaneous" && !image) return false; // Introduction video required
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        form.reset();
        setPreviewImage(null);
        setVideoThumbnail(null);
        setSelectedMediaType(null);
        setSelectedExistingVideo(null);
        setContent("");
        setImage(null);
        
        // Clear file inputs
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        if (videoInputRef.current) {
          videoInputRef.current.value = "";
        }
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          className="rounded-full bg-violet-700 hover:bg-violet-800 text-white border-0 shadow-lg"
          disabled={!user || (!user?.teamId && hasPostedIntroduction)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="h-screen max-h-[90vh] overflow-y-auto pb-32 sm:pb-28 pt-8">
        <div className="flex justify-between items-center mb-4 px-2">
          <Button 
            onClick={() => setOpen(false)} 
            variant="ghost" 
            className="h-8 w-8 p-0"
            aria-label="Close"
          >
            <span className="text-2xl font-bold">×</span>
          </Button>
          <DialogTitle className="text-xl font-bold text-center">
            {user?.teamId ? "Create Post" : "Create Introduction"}
          </DialogTitle>
        </div>
        <Form {...form}>
          <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex flex-col">
            
            <div className="space-y-6">
              {/* Show introduction restriction message for users without teams */}
              {!user?.teamId && hasPostedIntroduction && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    You have already posted your introduction. You can post more content once you join a team.
                  </p>
                </div>
              )}

              {/* Post Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {user?.teamId ? "Post Type" : "Introduction Type"}
                </Label>
                <RadioGroup 
                  value={selectedType} 
                  onValueChange={(value: PostType) => {
                    setSelectedType(value);
                    // Reset media and preview when type changes
                    setPreviewImage(null);
                    setImage(null);
                    setVideoThumbnail(null);
                    setSelectedMediaType(null);
                    form.setValue("mediaUrl", null); // Clear the form's mediaUrl field
                  }}
                  className="grid grid-cols-1 gap-2"
                >
                  {postTypes.map((type) => {
                    const isDisabled = !canCreatePost() || !remaining[type.value as keyof typeof remaining] || (!user?.teamId && hasPostedIntroduction);

                    return (
                      <div
                        key={type.value}
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-lg border transition-colors",
                          selectedType === type.value
                            ? "border-violet-500 bg-violet-50"
                            : "border-gray-200 hover:border-gray-300",
                          isDisabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <RadioGroupItem
                          value={type.value}
                          id={type.value}
                          disabled={isDisabled}
                        />
                        <div className="flex items-center space-x-2 flex-1">
                          {type.icon}
                          <div>
                            <Label htmlFor={type.value} className="font-medium cursor-pointer">
                              {type.label}
                            </Label>
                            <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                          </div>
                        </div>
                        {remaining[type.value as keyof typeof remaining] !== null && type.value !== "miscellaneous" && (
                          <span className="text-xs text-gray-500 ml-auto">
                            {remaining[type.value as keyof typeof remaining]} left
                          </span>
                        )}
                      </div>
                    );
                  })}
                </RadioGroup>
              </div>
            </div>

            {/* Content Input */}
            <div className="space-y-2">
              <Label htmlFor="content" className="text-sm font-medium">
                Content
              </Label>
              <Textarea
                id="content"
                placeholder={!user?.teamId ? "Tell us why you want to join and a little about yourself..." : "What's on your mind?"}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[100px] resize-none"
              />
            </div>

            {/* Media Upload */}
            {(selectedType === "food" || selectedType === "workout" || selectedType === "miscellaneous" || selectedType === "memory_verse") && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous") ? "Video" : "Image"}
                  {(selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous")) && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept={selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous") ? "video/*" : "image/*"}
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      Click to upload {selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous") ? "a video" : "an image"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedType === "memory_verse" || (!user?.teamId && selectedType === "miscellaneous")
                        ? "MP4, MOV, AVI up to 100MB" 
                        : "PNG, JPG, GIF up to 10MB"
                      }
                    </p>
                    {!user?.teamId && selectedType === "miscellaneous" && (
                      <p className="text-xs text-blue-600 mt-1 font-medium">
                        Video required for introduction
                      </p>
                    )}
                  </Label>
                </div>
                {previewImage && (
                  <div className="mt-2">
                    <img
                      src={previewImage}
                      alt="Preview"
                      className="max-w-full h-48 object-cover rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <div className="flex gap-2 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!user || isSubmitting || !canCreatePost() || (!user?.teamId && hasPostedIntroduction) || (!user?.teamId && selectedType === "miscellaneous" && !image)}
                  className="flex-1 bg-violet-700 hover:bg-violet-800 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {!user?.teamId ? "Submitting..." : "Posting..."}
                    </>
                  ) : (
                    !user?.teamId ? "Submit Introduction" : "Post"
                  )}
                </Button>
              </div>
            </DialogFooter>
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
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;

      let hasResolved = false;

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          console.warn('⏰ Video thumbnail generation timed out after 15 seconds');
          hasResolved = true;
          URL.revokeObjectURL(video.src);
          resolve(null);
        }
      }, 15000); // 15 second timeout

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

      // When video can play through, try multiple methods
      video.oncanplaythrough = () => {
        console.log('🎥 Video can play through - attempting thumbnail generation');

        // Try generating thumbnail immediately
        if (generateThumbnailFromCurrentFrame()) return;

        // If immediate capture failed, try seeking to a specific time
        setTimeout(() => {
          if (hasResolved) return;

          // For memory verse videos, try to seek to a better position
          const seekTime = video.duration > 0 
            ? Math.min(video.duration * 0.15, 3) // 15% into video or 3 seconds max
            : 1;
          console.log(`🔍 Seeking to ${seekTime} seconds for thumbnail (duration: ${video.duration}s)`);
          video.currentTime = seekTime;

          // Try again after seeking
          setTimeout(() => {
            if (!hasResolved) {
              generateThumbnailFromCurrentFrame();
            }
          }, 100);
        }, 100);
      };

      // When seeking completes
      video.onseeked = () => {
        console.log('✨ Video seeking completed');
        if (!hasResolved) {
          generateThumbnailFromCurrentFrame();
        }
      };

      // When video loads enough data
      video.onloadeddata = () => {
        console.log('📊 Video data loaded - trying thumbnail generation');
        if (!hasResolved) {
          generateThumbnailFromCurrentFrame();
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