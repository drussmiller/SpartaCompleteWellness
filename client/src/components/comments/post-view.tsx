import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { convertUrlsToLinks } from "@/lib/url-utils";
import { MessageCircle } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useCommentCount } from "@/hooks/use-comment-count";
import { getThumbnailUrl } from "@/lib/image-utils";
import { VideoPlayer } from "@/components/ui/video-player";
import { createMediaUrl } from "@/lib/media-utils";

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
          <p 
              className="mt-2 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ 
                __html: convertUrlsToLinks(post.content || '') 
              }}
            />

          {/* Show image if present and not a video */}
          {post.mediaUrl && !post.is_video && (
            <div className="relative mt-3 mb-3 w-screen -mx-4 md:w-full md:mx-0">
              <div className="w-full bg-gray-50">
                <img
                  src={getThumbnailUrl(post.mediaUrl, 'medium')}
                  alt={post.type}
                  className="w-full h-80 object-cover"
                />
              </div>
            </div>
          )}

          {/* Show video if present - using improved VideoPlayer component */}
          {post.mediaUrl && post.is_video && (
            <div className="relative mt-3 mb-3 w-screen -mx-4 md:w-full md:mx-0">
              <div className="w-full bg-gray-50">
                <VideoPlayer
                  src={createMediaUrl(post.mediaUrl)}
                  poster={getThumbnailUrl(post.mediaUrl, 'medium')}
                  className="w-full h-80 object-cover"
                  preload="metadata"
                  playsInline
                  controlsList="nodownload"
                  onLoad={() => {}}
                  onError={() => {}}
                />
              </div>
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