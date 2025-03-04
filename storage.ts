async deletePost(postId: number): Promise<void> {
    try {
      console.log(`Deleting post with ID: ${postId}`);

      // First delete any reactions to this post
      await db.delete(reactions).where(eq(reactions.postId, postId));
      console.log(`Deleted reactions for post ${postId}`);

      // Then delete the post itself
      const result = await db.delete(posts).where(eq(posts.id, postId));
      console.log(`Post deletion result:`, result);
    } catch (error) {
      console.error(`Error in deletePost for ID ${postId}:`, error);
      throw error;
    }
  }