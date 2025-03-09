import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CalendarIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  const { canPost, counts, refetch, remaining } = usePostLimits(selectedDate);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (type === 'memory_verse') {
      const isSaturday = selectedDate.getDay() === 6;
      return isSaturday ? "(Available today)" : "(Only available on Saturday)";
    }

    // Use the hook's remaining data, not the prop
    const typeKey = type as keyof typeof remaining;
    const remainingPosts = remaining[typeKey];
    
    if (remainingPosts <= 0) {
      return "(Daily limit reached)";
    }
    
    return `(${remainingPosts} remaining today)`;
  }

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostForm) => {
      try {
        const formData = new FormData();

        // For food and workout posts, ensure we have an image
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
          points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : 3,
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
    onSuccess: () => {
      // Immediately close the dialog and reset form
      setOpen(false);
      form.reset();
      setImagePreview(null);

      // Track what type of post was created
      const createdPostType = form.getValues("type");

      // Aggressively clear cache and force immediate refetch
      queryClient.resetQueries({ queryKey: ["/api/posts/counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      
      // Force immediate refresh of post counts data
      setTimeout(() => {
        refetch();
      }, 100);
      
      // Dispatch event to notify other components
      const event = new CustomEvent('post-counts-changed');
      window.dispatchEvent(event);

      toast({
        title: "Success",
        description: `${createdPostType.charAt(0).toUpperCase() + createdPostType.slice(1)} post created successfully!`,
      });
    },
    onError: (error) => {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <Button 
          onClick={() => setOpen(false)} 
          variant="ghost" 
          className="absolute left-2 top-2 h-8 w-8 p-0"
          aria-label="Close"
        >
          <span className="text-lg">×</span>
        </Button>
        <div className="flex justify-center items-center mb-4">
          <DialogTitle className="text-center">Create Post</DialogTitle>
        </div>
        <DialogDescription className="text-center">
          Share your wellness journey with your team
        </DialogDescription>

        <Form {...form}>
          <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <option value="food" disabled={!canPost.food}>
                        Food {getRemainingMessage('food')}
                      </option>
                      <option value="workout" disabled={!canPost.workout}>
                        Workout {getRemainingMessage('workout')}
                      </option>
                      <option value="scripture" disabled={!canPost.scripture}>
                        Scripture {getRemainingMessage('scripture')}
                      </option>
                      <option value="memory_verse" disabled={!canPost.memory_verse}>
                        Memory Verse {getRemainingMessage('memory_verse')}
                      </option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(form.watch("type") === "food" || form.watch("type") === "workout") && (
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              try {
                                const compressed = await compressImage(reader.result as string);
                                setImagePreview(compressed);
                                field.onChange(compressed);
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
                        ref={fileInputRef}
                      />
                    </FormControl>
                    {imagePreview && (
                      <div className="mt-2">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-40 rounded-md"
                        />
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
                          Remove Image
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-center mt-6">
              <Button
                type="submit"
                form="create-post-form"
                variant="default"
                className="w-full bg-violet-700 hover:bg-violet-800"
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