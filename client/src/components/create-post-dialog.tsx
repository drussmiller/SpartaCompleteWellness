import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertPostSchema } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usePostLimits } from "@/hooks/use-post-limits";
import { useAuth } from "@/hooks/use-auth";

type CreatePostForm = z.infer<typeof insertPostSchema>;

// Function to compress image
async function compressImage(imageDataUrl: string, maxWidth = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
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
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress with JPEG at 70% quality
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

export function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const { canPost, counts } = usePostLimits();
  const { user } = useAuth();

  console.log('Current post counts:', counts);
  console.log('Can post status:', canPost);

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "food",
      content: "",
      imageUrl: null,
      points: 3
    }
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostForm) => {
      const points = data.type === "memory_verse" ? 10 :
                    data.type === "comment" ? 1 : 3;

      const postData = {
        ...data,
        points,
        content: data.content || null,
        imageUrl: imagePreview || null,
      };

      console.log('Creating post with data:', postData);
      const res = await apiRequest("POST", "/api/posts", postData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || error.error || 'Failed to create post');
      }
      return res.json();
    },
    onSuccess: () => {
      if (user?.teamId) {
        queryClient.invalidateQueries({ queryKey: ["/api/posts", user.teamId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/limits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      setOpen(false);
      form.reset();
      setImagePreview(null);
      toast({
        title: "Success",
        description: "Post created successfully!",
      });
    },
    onError: (error: Error) => {
      console.error('Post creation error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function getRemainingMessage(type: string) {
    if (type === 'memory_verse') {
      return canPost.memory_verse ? "(Available on Saturday)" : "(Weekly limit reached)";
    }

    // Post limits
    const limits = {
      food: 3,
      workout: 1,
      scripture: 1
    };

    const used = counts[type as keyof typeof counts] || 0;
    const limit = limits[type as keyof typeof limits];

    if (!limit) return "";

    console.log(`Post type ${type}: ${used}/${limit} used`);
    return used >= limit ? "(Daily limit reached)" : `(${limit - used} remaining today)`;
  }

  const onSubmit = (data: CreatePostForm) => {
    console.log('Submitting form with data:', data);
    createPostMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-14 w-14 bg-gray-200 hover:bg-gray-300">
          <Plus className="h-10 w-10 text-black font-extrabold" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            <DialogFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  createPostMutation.isPending ||
                  !canPost[form.watch("type") as keyof typeof canPost]
                }
              >
                {createPostMutation.isPending ? "Creating..." : "Create Post"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
                className="bg-gray-400 hover:bg-gray-500 text-black font-bold h-14 w-full"
              >
                Close
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}