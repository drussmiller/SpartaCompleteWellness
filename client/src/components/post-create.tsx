// Submit handler for form
  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      const data = await createPost(values, previewImage);
      setOpen(false);
      router.refresh();
      
      // Use more specific invalidation to ensure counts are refreshed
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      
      // Force a refetch of post counts with exact queryKey match
      const now = new Date();
      const tzOffset = now.getTimezoneOffset();
      queryClient.invalidateQueries({ 
        queryKey: ["/api/posts/counts", now.toISOString(), tzOffset],
        exact: false
      });
      
      // Additional invalidation to catch all post count queries
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/posts/counts"
      });
    } catch (error) {

    } finally {
      setIsSubmitting(false);
    }
  };