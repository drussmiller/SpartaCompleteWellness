import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { MessagesSquare, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Post, User } from "@shared/schema";
import { convertUrlsToLinks } from "@/lib/url-utils";
import { MessageForm } from "./message-form";
import { VideoPlayer } from "@/components/ui/video-player";
import { createMediaUrl } from "@/lib/media-utils";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { Badge } from "@/components/ui/badge";
import { useKeyboardAdjustment } from "@/hooks/use-keyboard-adjustment";

// Extend the Window interface to include our custom property
declare global {
  interface Window {
    _SPARTA_ORIGINAL_VIDEO_FILE: File | null;
  }
}

// Initialize the custom property
if (typeof window !== 'undefined') {
  window._SPARTA_ORIGINAL_VIDEO_FILE = null;
}

// Custom Message interface that includes both field name variations
interface Message {
  id: number;
  userId: number;
  type: "food" | "workout" | "scripture" | "memory_verse" | "comment" | "miscellaneous";
  content: string | null;
  points: number;
  createdAt: Date | null;
  parentId: number | null;
  depth: number | null;
  is_video: boolean | null;
  // Message-specific fields
  sender: User;
  isRead: boolean;
  // Image URL variants
  imageUrl?: string;    // For compatibility with existing backend
  mediaUrl?: string | null;    // New field name used in other parts of the application
}

export function MessageSlideCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [messageText, setMessageText] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [isVideoFile, setIsVideoFile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number>(window.innerHeight);
  const [viewportTop, setViewportTop] = useState<number>(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const keyboardHeight = useKeyboardAdjustment();

  // Track viewport height and position changes for keyboard
  useEffect(() => {
    const updateViewport = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setViewportTop(window.visualViewport.offsetTop);
      } else {
        setViewportHeight(window.innerHeight);
        setViewportTop(0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }
    window.addEventListener('resize', updateViewport);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport);
        window.visualViewport.removeEventListener('scroll', updateViewport);
      }
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Swipe to close functionality
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (selectedMember) {
        setSelectedMember(null);
      } else {
        setIsOpen(false);
      }
    }
  });

  // Query for team members
  const { data: teamMembers = [], error: teamError, isLoading: teamMembersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) {
        return []; // Return empty array instead of throwing error
      }
      try {
        const response = await apiRequest("GET", "/api/users");

        // If user is not authorized (not admin), return empty array
        if (response.status === 403) {
          console.log("User not authorized to fetch all users, returning empty team members list");
          return [];
        }

        if (!response.ok) {
          console.log("Failed to fetch users, returning empty array");
          return [];
        }

        const users = await response.json();

        // Debug log to verify avatarColor is in the data
        if (users.length > 0) {
          console.log('Frontend received user data:', {
            id: users[0].id,
            username: users[0].username,
            avatarColor: users[0].avatarColor
          });
        }

        // Filter users to only show team members (excluding current user)
        const filteredUsers = users.filter((member: User) => {
          return member.teamId === user.teamId && member.id !== user.id;
        });

        return filteredUsers;
      } catch (error) {
        console.error("Error fetching users:", error);
        // Return empty array instead of throwing error
        return [];
      }
    },
    enabled: isOpen && !!user?.teamId,
    retry: 2,
    staleTime: 0, // Force fresh data every time
    gcTime: 10 * 60 * 1000 // 10 minutes
  });

  // Query for messages with selected member
  const { data: messages = [] } = useQuery<(Message & { sender: User })[]>({
    queryKey: ["/api/messages", selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      try {
        const response = await apiRequest(
          "GET",
          `/api/messages/${selectedMember.id}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Filter out messages with undefined/null image URLs to prevent display issues
        const cleanedData = data.map((message: any) => ({
          ...message,
          imageUrl: (message.imageUrl === '/uploads/undefined' || message.imageUrl === 'undefined' || !message.imageUrl) ? null : message.imageUrl,
          mediaUrl: (message.mediaUrl === '/uploads/undefined' || message.mediaUrl === 'undefined' || !message.mediaUrl) ? null : message.mediaUrl
        }));

        return cleanedData;
      } catch (error) {
        console.error("Error fetching messages:", error);
        throw error instanceof Error ? error : new Error("Failed to fetch messages");
      }
    },
    enabled: !!selectedMember,
    retry: 2,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000 // 5 minutes
  });

  // Query for unread message count
  const { data: messageCount = 0 } = useQuery({
    queryKey: ["/api/messages/unread/count"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/messages/unread/count");
        if (!response.ok) throw new Error("Failed to fetch unread messages");
        const data = await response.json();
        return data.unreadCount || 0;
      } catch (error) {
        console.error("Error fetching unread message count:", error);
        return 0;
      }
    },
    refetchInterval: 60000, // Refetch every 60 seconds instead of 30
    staleTime: 30000 // 30 seconds
  });

  useEffect(() => {
    setUnreadCount(messageCount);
  }, [messageCount]);

  // Query for unread messages by sender
  const { data: unreadMessagesData = [] } = useQuery<Array<{senderId: number, count: number, sender: any}>>({
    queryKey: ["/api/messages/unread/by-sender"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/messages/unread/by-sender");
        if (!response.ok) throw new Error("Failed to fetch unread messages by sender");
        return await response.json();
      } catch (error) {
        console.error("Error fetching unread messages by sender:", error);
        return [];
      }
    },
    enabled: isOpen,
    refetchInterval: 60000, // Refetch every 60 seconds instead of 30
    staleTime: 30000 // 30 seconds
  });

  // Convert array to lookup object for easier access
  const unreadMessages = React.useMemo(() => {
    const lookup: Record<number, boolean> = {};
    unreadMessagesData.forEach(item => {
      lookup[item.senderId] = true;
    });
    return lookup;
  }, [unreadMessagesData]);

  // Mark messages as read when selecting a member
  useEffect(() => {
    if (selectedMember) {
      const markMessagesAsRead = async () => {
        try {
          const response = await apiRequest("POST", "/api/messages/read", {
            senderId: selectedMember.id
          });

          if (response.ok) {
            // Invalidate both messages and unread count queries
            queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMember.id] });
            queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
            queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/by-sender"] });
          }
        } catch (error) {
          console.error("Error marking messages as read:", error);
        }
      };

      markMessagesAsRead();
    }
  }, [selectedMember]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          setIsVideoFile(false); // Reset video flag on paste
          const reader = new FileReader();
          reader.onload = (e) => {
            setPastedImage(e.target?.result as string);
          };
          reader.readAsDataURL(blob);
        }
        break;
      } else if (items[i].type.indexOf('video') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          // Store the original video file
          setIsVideoFile(true); // Set video flag for video file
          console.log("Video detected with type:", blob.type);

          // IMPORTANT: Store the original file in a state variable we can access later
          // We need to save this as a special property to reference later
          window._SPARTA_ORIGINAL_VIDEO_FILE = blob;

          // Create a URL for the video
          const url = URL.createObjectURL(blob);

          // For thumbnail preview only
          const video = document.createElement('video');
          video.src = url;
          video.preload = 'metadata';
          video.muted = true;
          video.playsInline = true;

          // Generate thumbnail when metadata is loaded
          video.onloadedmetadata = () => {
            video.currentTime = 0.1;
          };

          video.onseeked = () => {
            try {
              // Create canvas and draw video frame for PREVIEW only
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // Save the thumbnail just for display
                const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
                setPastedImage(thumbnailUrl);
                console.log("Generated video thumbnail for preview only");

                // Display toast to confirm video is attached
                toast({
                  description: `Video attached (${(blob.size / (1024 * 1024)).toFixed(2)}MB)`,
                  duration: 2000,
                });
              }
            } catch (error) {
              console.error("Error generating thumbnail from pasted video:", error);
            }
          };

          video.load();
        }
        break;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  const createMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember) throw new Error("No recipient selected");

      try {
        const formData = new FormData();

        // Add message content if present
        if (messageText.trim()) {
          formData.append('content', messageText.trim());
        }

        // Add image/video if present
        if (pastedImage) {
          if (isVideoFile && window._SPARTA_ORIGINAL_VIDEO_FILE) {
            // Use the original video file for upload
            console.log('Using original video file for upload:', {
              name: window._SPARTA_ORIGINAL_VIDEO_FILE.name,
              type: window._SPARTA_ORIGINAL_VIDEO_FILE.type,
              size: window._SPARTA_ORIGINAL_VIDEO_FILE.size
            });

            // Attach the original video file directly
            formData.append('image', window._SPARTA_ORIGINAL_VIDEO_FILE);

            // Set the is_video flag explicitly
            formData.append('is_video', 'true');

            // Add video extension for server processing
            const ext = window._SPARTA_ORIGINAL_VIDEO_FILE.name.split('.').pop() || 'mp4';
            formData.append('video_extension', ext);
          } else {
            // Handle image case - convert base64 to blob
            const response = await fetch(pastedImage);
            const blob = await response.blob();

            // Create a proper file from the blob
            const file = new File([blob], 'pasted-image.png', { type: blob.type });
            formData.append('image', file);

            // Set is_video flag as false
            formData.append('is_video', 'false');
          }
        }

        formData.append('recipientId', selectedMember.id.toString());

        console.log('Sending message with media:', {
          recipientId: selectedMember.id,
          hasContent: !!messageText.trim(),
          hasMedia: !!pastedImage,
          isVideo: isVideoFile
        });

        const res = await fetch('/api/messages', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('Message send failed:', res.status, errorText);
          throw new Error(`Failed to send message: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error creating message:", error);
        throw error instanceof Error ? error : new Error("Failed to send message");
      }
    },
    onSuccess: () => {
      // Invalidate all message-related queries to force fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/by-sender"] });

      // Clean up states
      setMessageText("");
      setPastedImage(null);
      setIsVideoFile(false);

      // Clear the stored video file
      if (window._SPARTA_ORIGINAL_VIDEO_FILE) {
        console.log("Clearing stored video file after successful send");
        window._SPARTA_ORIGINAL_VIDEO_FILE = null;
      }

      toast({
        description: "Message sent successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if ((!messageText.trim() && !pastedImage) || !selectedMember) return;
    createMessageMutation.mutate();
  };

  // Close messaging overlay when clicking outside and prevent body scroll
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedMember(null);
      }
    }

    if (isOpen) {
      // Prevent body scrolling when message overlay is open
      document.body.style.overflow = 'hidden';
      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        // Restore body scrolling when overlay is closed
        document.body.style.overflow = '';
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    <>
      <Button
        size="icon"
        className="h-10 w-10 bg-gray-200 hover:bg-gray-300 ml-2 relative"
        onClick={() => {
          console.log('Opening message slide card. User team ID:', user?.teamId);
          setIsOpen(true);
        }}
        disabled={!user?.teamId} // Disable button if user has no teamId
        style={!user?.teamId ? { opacity: 0.5, cursor: 'not-allowed' } : {}} // Visual indication
      >
        <MessagesSquare className="h-4 w-4 text-black font-extrabold" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Full screen slide-out panel - rendered via Portal at document body level */}
      {isOpen && createPortal(
        <div
        ref={cardRef}
        className="fixed left-0 right-0 bg-white z-[2147483647] flex flex-col"
        style={{
          top: `${viewportTop}px`,
          height: `${viewportHeight}px`,
          touchAction: 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Card
          className="w-full h-full rounded-none bg-white border-none shadow-none flex flex-col"
          style={{ overflow: 'hidden' }}
        >
          {/* Header - Fixed at top */}
          <div className="flex items-center px-4 py-4 border-b bg-white border-gray-200 flex-shrink-0 min-h-[80px] z-50 sticky top-0" style={{ paddingTop: '4rem' }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (selectedMember) {
                  setSelectedMember(null);
                } else {
                  setIsOpen(false);
                }
              }}
              className="mr-3 bg-transparent hover:bg-gray-100 flex-shrink-0"
            >
              <ChevronLeft className="h-6 w-6 text-black" />
            </Button>
            <h2 className="text-2xl font-bold text-black flex-1">
              {selectedMember ? selectedMember.username : "Messages"}
            </h2>
          </div>

          {/* Content Area */}
          {!selectedMember ? (
            // Team Members List
            <ScrollArea
              className="flex-1 bg-white overflow-y-auto"
              style={{
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
            >
              <div className="space-y-2 p-4 pb-32 bg-white">
                {teamMembersLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 bg-white">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">Loading team members...</p>
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center text-gray-500 py-8 bg-white">
                    No team members available
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-100 rounded-lg cursor-pointer bg-white border border-gray-100"
                      onClick={() => setSelectedMember(member)}
                    >
                      <Avatar>
                        {member.imageUrl && <AvatarImage src={member.imageUrl} alt={member.username} />}
                        <AvatarFallback
                          style={{ backgroundColor: member.avatarColor || '#6366F1' }}
                          className="text-white"
                        >
                          {member.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className={`${unreadMessages[member.id] ? 'font-extrabold' : 'font-normal'} text-black`}>
                          {member.username}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          ) : (
            // Messages View
            <div className="flex flex-col flex-1 bg-white overflow-hidden">
              {/* Messages List */}
              <ScrollArea
                className="flex-1 bg-white"
                style={{
                  touchAction: 'pan-y',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'none',
                  overscrollBehaviorY: 'none',
                  paddingBottom: '16px',
                  overflowY: 'auto'
                }}
              >
                <div className="space-y-4 p-4 bg-white pb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender.id === user?.id ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.sender.id !== user?.id && (
                        <Avatar className="mr-2">
                          {message.sender.imageUrl && <AvatarImage src={message.sender.imageUrl} alt={message.sender.username || "Unknown User"} />}
                          <AvatarFallback
                            style={{ backgroundColor: message.sender.avatarColor || '#6366F1' }}
                            className="text-white"
                          >
                            {message.sender.username?.[0].toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          message.sender.id === user?.id
                            ? "bg-[#8A2BE2] text-white ml-2"
                            : "bg-muted mr-2"
                        }`}
                      >
                        {message.content && (
                          <p
                            className="break-words"
                            dangerouslySetInnerHTML={{
                              __html: convertUrlsToLinks(message.content || '')
                            }}
                          />
                        )}

                        {(message.imageUrl || message.mediaUrl) &&
                         (message.imageUrl !== '/uploads/undefined' && message.mediaUrl !== '/uploads/undefined') &&
                         (message.imageUrl !== 'undefined' && message.mediaUrl !== 'undefined') && (
                          message.is_video ? (
                            <VideoPlayer
                              src={createMediaUrl(message.imageUrl || message.mediaUrl || '')}
                              className="max-w-full rounded mt-2"
                              onError={() => console.error("Error loading message video:", message.imageUrl || message.mediaUrl)}
                            />
                          ) : (
                            <img
                              src={createMediaUrl(message.imageUrl || message.mediaUrl || '')}
                              alt="Message image"
                              className="max-w-full rounded mt-2"
                              onLoad={() => console.log("Message image loaded successfully:", message.imageUrl || message.mediaUrl)}
                              onError={(e) => {
                                console.error("Error loading message image:", message.imageUrl || message.mediaUrl);
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message Input - Fixed at bottom of container */}
              <div
                className="px-4 pb-5 bg-white flex-shrink-0"
                style={{
                  backgroundColor: '#ffffff'
                }}
              >
                {/* MessageForm component now handles its own input and submission logic */}
                <MessageForm
                  onSubmit={async (content, imageData, isVideo = false) => {
                    if (!content.trim() && !imageData) return;
                    if (!selectedMember) return;

                    try {
                      const formData = new FormData();

                      // Add message content if present
                      if (content.trim()) {
                        formData.append('content', content.trim());
                      }

                      // Add image/video if present
                      if (imageData) {
                        // Check if we have a saved video file to use
                        if ((isVideo || isVideoFile) && window._SPARTA_ORIGINAL_VIDEO_FILE) {
                          // Use the original video file we saved
                          console.log('MessageForm using original video file for upload with type:',
                                     window._SPARTA_ORIGINAL_VIDEO_FILE.type);

                          // Determine appropriate extension based on MIME type
                          const videoExt = window._SPARTA_ORIGINAL_VIDEO_FILE.type.includes('mp4') ? '.mp4' :
                                        window._SPARTA_ORIGINAL_VIDEO_FILE.type.includes('quicktime') ? '.mov' : '.mp4';

                          // Attach the video with proper extension
                          formData.append('image', window._SPARTA_ORIGINAL_VIDEO_FILE, `video-message${videoExt}`);

                          // Set is_video flag
                          formData.append('is_video', 'true');
                        } else {
                          // Standard image handling
                          const response = await fetch(imageData);
                          const blob = await response.blob();

                          formData.append('image', blob, 'pasted-image.png');
                          formData.append('is_video', 'false');
                        }
                      }

                      formData.append('recipientId', selectedMember.id.toString());

                      // Update state variables with the content and image
                      setMessageText(content);
                      setPastedImage(imageData);

                      // Submit the message via fetch directly instead of using the mutation
                      const res = await fetch('/api/messages', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include'
                      });

                      if (!res.ok) {
                        throw new Error("Failed to send message");
                      }

                      const data = await res.json();

                      // Clear the form on success
                      setMessageText("");
                      setPastedImage(null);
                      setIsVideoFile(false);

                      // Clear the stored video file
                      if (window._SPARTA_ORIGINAL_VIDEO_FILE) {
                        console.log("Clearing stored video file after successful send");
                        window._SPARTA_ORIGINAL_VIDEO_FILE = null;
                      }

                      // Update queries to show the new message
                      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMember.id] });
                      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });

                      // Show success toast
                      toast({
                        description: "Message sent successfully",
                      });
                    } catch (error) {
                      console.error("Error processing message submission:", error);
                      // Show error toast
                      toast({
                        title: "Error sending message",
                        description: error instanceof Error ? error.message : "An unexpected error occurred",
                        variant: "destructive"
                      });
                    }
                  }}
                  isSubmitting={createMessageMutation.isPending}
                  placeholder="Enter a message"
                  defaultValue={messageText}
                />
              </div>
            </div>
          )}
        </Card>
      </div>,
        document.body
      )}
    </>
  );
}