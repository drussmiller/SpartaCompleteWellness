import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface CommentInputProps {
  postId: number;
  onCommentSubmitted: () => void; // Callback to refresh comments
}

export function CommentInput({ postId, onCommentSubmitted }: CommentInputProps) {
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('content', content);
    if (media) {
      formData.append('media', media);
    }

    try {
      await apiRequest('POST', `/api/posts/${postId}/comments`, {
        body: formData,
      });
      setContent('');
      setMedia(null);
      onCommentSubmitted(); // Refresh the comments after submission
    } catch (error) {
      console.error('Failed to submit comment:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your comment..."
        required
      />
      <input
        type="file"
        accept="image/*,video/*"
        onChange={(e) => setMedia(e.target.files ? e.target.files[0] : null)}
      />
      <button type="submit">Submit</button>
    </form>
  );
}