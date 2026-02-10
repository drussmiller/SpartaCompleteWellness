import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Post, User } from "@shared/schema";
import { convertUrlsToLinks } from "@/lib/url-utils";
import { MessageCircle, ImageOff } from "lucide-react";
import { ReactionButton } from "@/components/reaction-button";
import { ReactionSummary } from "@/components/reaction-summary";
import { useCommentCount } from "@/hooks/use-comment-count";
import { getThumbnailUrl } from "@/lib/image-utils";
import { VideoPlayer } from "@/components/ui/video-player";
import { createMediaUrl, createThumbnailUrl } from "@/lib/media-utils";

interface PostViewProps {
  post: Post & { author: User };
}

export function PostView({ post }: PostViewProps) {
  const { count: commentCount } = useCommentCount(post.id);
  const [imageError, setImageError] = useState(false);
  
  // Helper function to get video thumbnail URL (same logic as post-card.tsx)
  const getVideoThumbnailUrl = () => {
    // Use database thumbnailUrl if available (for HLS videos and new uploads)
    const dbThumbnail = (post as any).thumbnailUrl || (post as any).thumbnail_url;
    if (dbThumbnail) {
      return dbThumbnail;
    }
    
    if (!post.mediaUrl) return undefined;
    
    // Don't try to create thumbnails for HLS playlists
    if (post.mediaUrl.includes('.m3u8') || post.mediaUrl.includes('/api/hls/')) {
      return undefined;
    }
    
    // For regular video files, create thumbnail URL by replacing extension with .jpg
    if (post.mediaUrl.toLowerCase().match(/\.(mov|mp4|webm|avi)$/)) {
      let filename = post.mediaUrl;
      
      // Extract filename from URL if needed
      if (filename.includes('filename=')) {
        const urlParams = new URLSearchParams(filename.split('?')[1]);
        filename = urlParams.get('filename') || filename;
      } else if (filename.includes('/')) {
        filename = filename.split('/').pop() || filename;
      }
      
      // Remove query parameters
      if (filename.includes('?')) {
        filename = filename.split('?')[0];
      }
      
      // Replace video extension with .jpg
      const jpgFilename = filename.replace(/\.(mov|mp4|webm|avi)$/i, '.jpg');
      // Add cache-busting using post ID to force reload of previously failed thumbnails
      return `/api/serve-file?filename=${encodeURIComponent(jpgFilename)}&_cb=${post.id}`;
    }

    // For other files, don't create a thumbnail
    return undefined;
  };
  
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

          {post.mediaUrl && !post.is_video && (
            <div className="mt-3 mb-3 flex justify-center">
              {imageError ? (
                <div className="w-full h-32 bg-gray-100 flex flex-col items-center justify-center text-gray-400 rounded-md">
                  <ImageOff className="h-8 w-8 mb-1" />
                  <span className="text-sm">Image unavailable</span>
                </div>
              ) : (
                <img
                  src={createMediaUrl(post.mediaUrl)}
                  alt={post.type}
                  className="max-w-full h-auto object-contain rounded-md"
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          )}

          {/* Show video if present - using improved VideoPlayer component */}
          {post.mediaUrl && post.is_video && (
            <div className="mt-3 mb-3 w-full video-container" data-post-id={post.id}>
              <VideoPlayer
                src={createMediaUrl(post.mediaUrl)}
                poster={getVideoThumbnailUrl()}
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