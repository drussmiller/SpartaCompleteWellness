import { useParams } from "wouter";
import { CommentView } from "@/components/comment-view";

export default function CommentsPage() {
  const { id } = useParams<{ id: string }>();
  
  if (!id) {
    return <div>Post not found</div>;
  }

  return (
    <div className="container mx-auto py-6">
      <CommentView postId={id} />
    </div>
  );
}
