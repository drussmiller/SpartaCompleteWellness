import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

type CreatePostForm = z.infer<typeof insertPostSchema>;

export function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
      // Calculate points based on post type
      const points = data.type === "memory_verse" ? 10 : 
                    data.type === "comment" ? 1 : 3;

      // Create post data
      const postData = {
        ...data,
        points,
        content: data.content || null,
        imageUrl: imagePreview || null,
      };

      const res = await apiRequest("POST", "/api/posts", postData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create post');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setOpen(false);
      form.reset();
      setImagePreview(null);
      toast({
        title: "Success",
        description: "Post created successfully!",
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

  const onSubmit = async (data: CreatePostForm) => {
    try {
      await createPostMutation.mutateAsync(data);
    } catch (error) {
      console.error('Error in form submission:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-10 w-10">
          <Plus className="h-6 w-6" />
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
                      <option value="food">Food</option>
                      <option value="workout">Workout</option>
                      <option value="scripture">Scripture</option>
                      <option value="memory_verse">Memory Verse</option>
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
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImagePreview(reader.result as string);
                              field.onChange(reader.result as string);
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

            <Button 
              type="submit" 
              className="w-full" 
              disabled={createPostMutation.isPending}
            >
              {createPostMutation.isPending ? "Creating..." : "Create Post"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}