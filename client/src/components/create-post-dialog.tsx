import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CalendarIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

type CreatePostForm = z.infer<typeof insertPostSchema> & {
  postDate?: Date;
};

export function CreatePostDialog({ remaining: propRemaining }: { remaining: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { canPost, counts, refetch, remaining, workoutWeekPoints, memoryVerseWeekCount } = usePostLimits(selectedDate);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null); // Added video input ref
  const queryClient = useQueryClient();

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "food",
      content: "",
      imageUrl: null,
      points: 3,
      postDate: selectedDate
    }
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
      if (workoutWeekPoints >= 15) {
        return "(reached 15 points this week)";
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
        const formData = new FormData();

        if ((data.type === 'food' || data.type === 'workout') && (!data.imageUrl || data.imageUrl.length === 0)) {
          throw new Error(`${data.type === 'food' ? 'Food' : 'Workout'} posts require an image`);
        }

        if (data.imageUrl && data.imageUrl.length > 0) {
          try {
            const blob = await fetch(data.imageUrl).then(r => r.blob());
            formData.append("image", blob, "image.jpeg");
          } catch (error) {
            console.error("Error processing image:", error);
            throw new Error("Failed to process image");
          }
        }

        const postData = {
          type: data.type,
          content: data.content.trim(),
          points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : data.type === "miscellaneous" ? 0 : 3,
          createdAt: data.postDate ? data.postDate.toISOString() : selectedDate.toISOString()
        };

        formData.append("data", JSON.stringify(postData));

        const response = await fetch("/api/posts", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
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
        imageUrl: imagePreview,
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

      toast({
        title: "Success",
        description: `${newPost.type.charAt(0).toUpperCase() + newPost.type.slice(1)} post created successfully!`,
      });
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
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch("type") === "memory_verse" ? "Video Recording or Upload" : "Image"}
                    </FormLabel>
                    <div className="space-y-4">
                      {form.watch("type") === "memory_verse" && (
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline"
                            onClick={() => {
                              if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                                  .then(stream => {
                                    const mediaRecorder = new MediaRecorder(stream);
                                    let chunks: BlobPart[] = [];
                                    
                                    mediaRecorder.ondataavailable = (e) => {
                                      chunks.push(e.data);
                                    };
                                    
                                    mediaRecorder.onstop = () => {
                                      const blob = new Blob(chunks, { type: 'video/webm' });
                                      const videoUrl = URL.createObjectURL(blob);
                                      setImagePreview(videoUrl);
                                      field.onChange(videoUrl);
                                      chunks = [];
                                      stream.getTracks().forEach(track => track.stop());
                                    };
                                    
                                    mediaRecorder.start();
                                    setTimeout(() => mediaRecorder.stop(), 60000); // 60 second limit
                                  })
                                  .catch(err => {
                                    console.error('Error accessing camera:', err);
                                    toast({
                                      title: "Error",
                                      description: "Could not access camera. Please check permissions.",
                                      variant: "destructive",
                                    });
                                  });
                              }
                            }}
                          >
                            Record Video
                          </Button>
                          <Input
                            type="file"
                            accept="video/*,image/*"
                            ref={videoInputRef}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  try {
                                    if (file.type.startsWith("video/")) {
                                      setImagePreview(reader.result as string);
                                      field.onChange(reader.result);
                                    } else {
                                      const compressed = await compressImage(reader.result as string);
                                      setImagePreview(compressed);
                                      field.onChange(compressed);
                                    }
                                  } catch (error) {
                                    console.error('Error processing file:', error);
                                    toast({
                                      title: "Error",
                                      description: "Failed to process file. Please try again.",
                                      variant: "destructive",
                                    });
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <FormControl>
                      {form.watch("type") !== "memory_verse" && (
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
                    </FormControl>
                    {imagePreview && (
                      <div className="mt-2">
                        {form.watch("type") === "memory_verse" && (
                          <video src={imagePreview} controls className="max-h-40 rounded-md" />
                        )}
                        {form.watch("type") !== "memory_verse" && (
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