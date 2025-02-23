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

  const form = useForm<CreatePostForm>({
    resolver: zodResolver(insertPostSchema),
    defaultValues: {
      type: "food",
      content: "",
      imageUrl: "",
      points: 3
    }
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostForm) => {
      try {
        // Set points based on post type
        const points = data.type === "memory_verse" ? 10 : 
                      data.type === "comment" ? 1 : 3;

        const postData = {
          ...data,
          points,
          // Ensure these are at least empty strings, not null
          content: data.content || "",
          imageUrl: data.imageUrl || ""
        };

        console.log('Attempting to submit post:', postData);
        const res = await apiRequest("POST", "/api/posts", postData);
        console.log('Post creation response:', await res.clone().json());
        return res.json();
      } catch (error) {
        console.error('Error in mutation:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Post created successfully');
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setOpen(false);
      form.reset();
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

  const onSubmit = (data: CreatePostForm) => {
    console.log('Form submitted with data:', data);
    try {
      createPostMutation.mutate(data);
    } catch (error) {
      console.error('Error in form submission:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-28 w-28">
          <Plus className="h-16 w-16" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              console.log('Form submission started');
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-4"
          >
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
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Image URL</FormLabel>
                    <FormControl>
                      <Input 
                        {...field}
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        type="url" 
                        placeholder="https://..." 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(form.watch("type") === "scripture" || form.watch("type") === "memory_verse" || form.watch("type") === "comment") && (
              <FormField
                control={form.control}
                name="content"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field}
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Enter your text..." 
                      />
                    </FormControl>
                    <FormMessage />
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