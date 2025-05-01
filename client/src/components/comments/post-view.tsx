import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { MessageCircle } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useCommentCount } from "@/hooks/use-comment-count";
import { getThumbnailUrl, generateImagePlaceholder } from "@/lib/image-utils";

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
                src={post.mediaUrl}
                alt={post.type}
                className="max-w-full h-auto object-contain rounded-md"
                onError={(e) => {
                  console.error("Failed to load image in post view:", post.mediaUrl);
                  
                  // Use our improved placeholder from generateImagePlaceholder
                  const img = e.currentTarget;
                  
                  // Keep the image visible, but show a placeholder SVG instead
                  img.src = generateImagePlaceholder(`${post.type.charAt(0).toUpperCase() + post.type.slice(1)} Image`);
                  
                  // Report the error in the console but keep the UI working
                  console.warn(`Using placeholder for missing image in post ${post.id}: ${post.mediaUrl}`);
                }}
              />
            </div>
          )}
          
          {/* Show video if present */}
          {post.mediaUrl && post.is_video && (
            <div className="mt-3 mb-3 flex justify-center">
              <video
                src={post.mediaUrl}
                poster={getThumbnailUrl(post.mediaUrl, 'medium')}
                controls
                preload="metadata"
                className="max-w-full h-auto object-contain rounded-md"
                playsInline
                onLoadStart={() => {
                  console.log(`Comment view: Video loading with poster: ${getThumbnailUrl(post.mediaUrl, 'medium')}`);
                }}
                onError={(e) => {
                  console.error(`Failed to load video in comment view: ${post.mediaUrl}`);
                  
                  // Try to show a nice placeholder instead of a broken video element
                  const videoElement = e.currentTarget;
                  const container = videoElement.parentElement;
                  
                  if (container) {
                    // Hide the video element
                    videoElement.style.display = 'none';
                    
                    // Create a placeholder image
                    const placeholderImg = document.createElement('img');
                    placeholderImg.src = generateImagePlaceholder(`${post.type.charAt(0).toUpperCase() + post.type.slice(1)} Video`);
                    placeholderImg.alt = "Video could not be loaded";
                    placeholderImg.className = "max-w-full h-auto object-contain rounded-md";
                    
                    // Add it to the container
                    container.appendChild(placeholderImg);
                  }
                  
                  // Try to trigger poster generation for future views
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
                  
                  // Log warning for debugging
                  console.warn(`Using placeholder for missing video in post ${post.id}: ${post.mediaUrl}`);
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