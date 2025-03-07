// Submit handler for form
  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      const data = await createPost(values, previewImage);
      setOpen(false);
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      // Invalidate post counts to refresh limits after posting
      queryClient.invalidateQueries({ queryKey: ["/api/posts/counts"] });
    } catch (error) {

    } finally {
      setIsSubmitting(false);
    }
  };