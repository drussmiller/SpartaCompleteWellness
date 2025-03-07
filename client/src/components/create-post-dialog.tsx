import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type CreatePostForm = z.infer<typeof insertPostSchema> & {
  postDate?: Date;
};

export function CreatePostDialog({ remaining }: { remaining: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { canPost, counts, remaining: dateLimits, refetch } = usePostLimits(selectedDate);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use either the date-specific limits or the default remaining
  const effectiveRemaining = dateLimits || remaining;

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "food",
      content: "",
      imageUrl: null,
      points: 3,
      postDate: new Date()
    }
  });

  function getRemainingMessage(type: string) {
    if (type === 'memory_verse') {
      const isSaturday = selectedDate.getDay() === 6;
      return canPost.memory_verse && isSaturday ? "(Available on Saturday)" : "(Weekly limit reached)";
    }

    const remainingPosts = effectiveRemaining?.[type] ?? 0;
    const isToday = new Date().toDateString() === selectedDate.toDateString();
    const dayText = isToday ? 'today' : 'on this day';

    return remainingPosts <= 0 ? "(Daily limit reached)" : `(${remainingPosts} remaining ${dayText})`;
  }

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostForm) => {
      try {
        const formData = new FormData();

        if (data.imageUrl && data.imageUrl.length > 0) {
          const blob = await fetch(data.imageUrl).then(r => r.blob());
          formData.append("image", blob, "image.jpeg");
        }

        const postData = {
          type: data.type,
          content: data.content,
          points: data.type === "memory_verse" ? 10 : data.type === "comment" ? 1 : 3,
          createdAt: data.postDate ? data.postDate.toISOString() : new Date().toISOString()
        };

        formData.append("data", JSON.stringify(postData));

        const res = await fetch("/api/posts", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed to create post: ${res.status} ${res.statusText}`);
        }

        return res.json();
      } catch (error) {
        console.error("Post creation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate both posts and counts queries
      if (user?.teamId) {
        queryClient.invalidateQueries({ queryKey: ["/api/posts", user.teamId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });

      // Invalidate post counts for both current date and selected date
      const today = new Date().toISOString();
      const selectedDateString = selectedDate.toISOString();

      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/counts"],
        exact: false // This ensures we invalidate all variations of the counts query
      });

      // Close dialog and reset form
      setOpen(false);
      form.reset();
      setImagePreview(null);

      // Show success message
      toast({
        title: "Success",
        description: "Post created successfully!",
      });

      // Refetch limits after a small delay to ensure server has processed the new post
      setTimeout(() => {
        refetch().then(() => {
          console.log("Post limits refreshed after posting");
        }).catch(error => {
          console.error("Error refreshing post limits:", error);
        });
      }, 500); // Increased delay to ensure server processing
    },
    onError: (error) => {
      console.error("Create post mutation error:", error);
      toast({
        title: "Error Creating Post",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreatePostForm) => {
    console.log('Submitting form with data:', data);
    createPostMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setImagePreview(null);
        form.reset();
      }
    }}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-10 w-10 bg-gray-200 hover:bg-gray-300">
          <Plus className="h-16 w-16 text-black font-extrabold" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogPrimitive.Close className="absolute left-4 top-8 opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:text-muted-foreground border-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        <div className="flex justify-between items-center mb-4">
          <DialogTitle className="flex-1 text-center">Create Post</DialogTitle>
          <Button
            type="submit"
            form="create-post-form"
            variant="default"
            size="sm"
            className="h-6 w-20 bg-violet-700 hover:bg-violet-800 text-sm"
            disabled={createPostMutation.isPending || !canPost[form.watch("type") as keyof typeof canPost]}
          >
            {createPostMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
              </>
            ) : (
              "Post"
            )}
          </Button>
        </div>

        <Form {...form}>
          <form id="create-post-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <option value="comment">Comment</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          field.onChange(date);
                          if (date) {
                            setSelectedDate(date);
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