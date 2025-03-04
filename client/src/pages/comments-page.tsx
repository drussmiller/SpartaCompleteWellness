const { postId } = useParams<{ postId: string }>(); // Get postId from URL params
  const postIdNum = parseInt(postId || "0");
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const queryClient = useQueryClient();

  // Fetch the original post
  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: [`/api/posts/${postIdNum}`],
    queryFn: async () => {
      if (!postIdNum || isNaN(postIdNum)) throw new Error("Invalid post ID");
      const res = await apiRequest("GET", `/api/posts/${postIdNum}`);
      if (!res.ok) throw new Error("Failed to fetch post");
      return res.json();
    },
    enabled: !!postIdNum && !isNaN(postIdNum),
  });

  // Fetch comments for this post
  const { 
    data: comments = [], 
    isLoading: commentsLoading,
    refetch
  } = useQuery({
    queryKey: [`/api/posts/comments/${postIdNum}`],
    queryFn: async () => {
      if (!postIdNum || isNaN(postIdNum)) throw new Error("Invalid post ID");
      const res = await apiRequest("GET", `/api/posts/comments/${postIdNum}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!postIdNum && !isNaN(postIdNum),
  });