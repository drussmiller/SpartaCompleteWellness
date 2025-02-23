import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PostType = "food" | "workout" | "scripture" | "memory_verse" | "comment";

interface PostForm {
  type: PostType;
  content?: string;
  imageUrl?: string;
  points?: number; // Added points field
}

export function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const form = useForm<PostForm>({
    defaultValues: {
      type: "food",
    }
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: PostForm) => {
      // Calculate points based on post type
      let points = 0;
      switch (data.type) {
        case "food":
        case "workout":
        case "scripture":
          points = 3;
          break;
        case "memory_verse":
          points = 10;
          break;
        case "comment":
          points = 1;
          break;
      }

      const postData = {
        ...data,
        points, // Include points in the request
      };

      const res = await apiRequest("POST", "/api/posts", postData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Post created",
        description: "Your post has been created successfully.",
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-10 w-10">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createPostMutation.mutate(data))} className="space-y-4">
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
                </FormItem>
              )}
            />

            {(form.watch("type") === "food" || form.watch("type") === "workout") && (
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL</FormLabel>
                    <FormControl>
                      <Input {...field} type="url" placeholder="https://..." />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {(form.watch("type") === "scripture" || form.watch("type") === "memory_verse" || form.watch("type") === "comment") && (
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter your text..." />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" className="w-full" disabled={createPostMutation.isPending}>
              {createPostMutation.isPending ? "Creating..." : "Create Post"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}