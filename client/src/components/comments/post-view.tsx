import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useCommentCount } from "@/hooks/use-comment-count";
import { getThumbnailUrl } from "@/lib/image-utils";
import { VideoPlayer } from "@/components/ui/video-player";

interface PostViewProps {
  post: Post & { author: User };
}

export function PostView({ post }: PostViewProps) {
  const { count: commentCount } = useCommentCount(post.id);
  return (
    <Card className="relative w-full rounded-md bg-white overflow-hidden">
      <CardContent className="pt-4 px-4">
        <div className="flex flex-col">
          <div>
            <div className="flex justify-between">
              <div className="flex items-center">
                <p className="font-medium">{post.author?.username}</p>
              </div>
            </div>
            <div className="mt-2 border-t border-gray-200"></div>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{post.content}</p>

          {/* Show image if present and not a video */}
          {post.mediaUrl && !post.is_video && (
            <div className="mt-3 mb-3 flex justify-center">
              <img
                src={getImageUrl(post.mediaUrl)}
                alt={post.type}
                className="max-w-full h-auto object-contain rounded-md"
              />
            </div>
          )}

          {/* Show video if present - using improved VideoPlayer component */}
          {post.mediaUrl && post.is_video && (
            <div className="mt-3 mb-3 w-full video-container" data-post-id={post.id}>
              <VideoPlayer
                src={post.mediaUrl}
                poster={getThumbnailUrl(post.mediaUrl, 'medium')}
                className="w-full video-player-container rounded-md"
                preload="metadata"
                playsInline
                controlsList="nodownload"
                onLoad={() => {
                  console.log(`Comment view: Video loaded successfully for post ${post.id}`);
                }}
                onError={(error) => {
                  console.error(`Failed to load video in comment view: ${post.mediaUrl}`, error);
                  // Try to trigger poster generation
                  fetch('/api/video/generate-posters', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      mediaUrl: post.mediaUrl,
                      postId: post.id,
                    }),
                    credentials: 'include',
                  }).catch(err => console.error("Error requesting poster generation:", err));
                }}
              />
            </div>
          )}

          <div className="border-t border-gray-200 mt-2"></div>

          <div className="flex items-center gap-2 py-2">
            <ReactionButton postId={post.id} />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
            >
              <MessageCircle className="h-4 w-4" />
              {commentCount}
            </Button>
          </div>

          {/* Grey line separator */}
          <div className="border-t border-gray-200"></div>

          {/* Reactions display */}
          <div className="flex justify-between items-center pt-2">
            <ReactionSummary postId={post.id} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const getImageUrl = (url: string | null): string => {
  if (!url) return '';

  // Use object storage utils to create correct URL
  const { createDirectDownloadUrl } = require('../../lib/object-storage-utils');
  return createDirectDownloadUrl(url);
}