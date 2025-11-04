import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Post, User } from "@shared/schema";
import { MessageForm } from "./message-form";

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
  const { user } = useAuth();
  const { toast } = useToast();

  // Query for team members
  const { data: teamMembers = [], error: teamError } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      if (!user?.teamId) {
        throw new Error("No team assigned");
      }
      try {
        console.log('Fetching users with user team ID:', user.teamId);
        const response = await apiRequest("GET", "/api/users");

        if (!response.ok) {
          throw new Error("Failed to fetch users");
        }

        const users = await response.json();
        console.log('All users:', users);

        // Filter users to only show team members (excluding current user)
        const filteredUsers = users.filter((member: User) => {
          return member.teamId === user.teamId && member.id !== user.id;
        });

        console.log('Filtered team members:', filteredUsers);
        return filteredUsers;
      } catch (error) {
        console.error("Error fetching users:", error);
        throw error instanceof Error ? error : new Error("Failed to fetch users");
      }
    },
    enabled: isOpen && !!user?.teamId,
    retry: 2
  });

  // Query for messages with selected member
  const { data: messages = [] } = useQuery<(Message & { sender: User })[]>({
    queryKey: ["/api/messages", selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      try {
        console.log('Fetching messages for recipient:', selectedMember.id);
        const response = await apiRequest(
          "GET",
          `/api/messages/${selectedMember.id}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }

        const data = await response.json();
        console.log('Messages response:', data);
        return data;
      } catch (error) {
        console.error("Error fetching messages:", error);
        throw error instanceof Error ? error : new Error("Failed to fetch messages");
      }
    },
    enabled: !!selectedMember,
    retry: 2
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
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  useEffect(() => {
    setUnreadCount(messageCount);
  }, [messageCount]);

  // Query for unread messages by sender
  const { data: unreadMessages = {} } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/messages/unread/by-sender"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/messages/unread/by-sender");
        if (!response.ok) throw new Error("Failed to fetch unread messages by sender");
        return await response.json();
      } catch (error) {
        console.error("Error fetching unread messages by sender:", error);
        return {};
      }
    },
    enabled: isOpen,
    refetchInterval: 30000
  });

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
          const reader = new FileReader();
          reader.onload = (e) => {
            setPastedImage(e.target?.result as string);
          };
          reader.readAsDataURL(blob);
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

        // Add image if present
        if (pastedImage) {
          // Convert base64 to blob
          const response = await fetch(pastedImage);
          const blob = await response.blob();
          formData.append('image', blob, 'pasted-image.png');
        }

        formData.append('recipientId', selectedMember.id.toString());

        const res = await fetch('/api/messages', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error("Failed to send message");
        }

        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error creating message:", error);
        throw error instanceof Error ? error : new Error("Failed to send message");
      }
    },
    onSuccess: () => {
      // Invalidate both messages and unread count queries
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMember?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
      setMessageText("");
      setPastedImage(null);
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

  return (
    <>
      <Button
        size="icon"
        className="h-10 w-10 bg-gray-200 hover:bg-gray-300 ml-2 relative"
        onClick={() => {
          console.log('Opening message slide card. User team ID:', user?.teamId);
          setIsOpen(true);
        }}
      >
        <MessageCircle className="h-4 w-4 text-black font-extrabold" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
            {unreadCount}
          </span>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Full screen slide-out panel */}
      <div
        className={`fixed inset-0 bg-background transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } pt-12 z-[9999]`}
        style={{ 
          height: '100%',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))'
        }}
      >
        <Card className="h-full rounded-none">
          {/* Header */}
          <div className="flex items-center p-4 border-b">
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
              className="mr-2 scale-125"
            >
              <ChevronLeft className="h-8 w-8 scale-125" />
            </Button>
            <h2 className="text-lg font-semibold">
              {selectedMember ? selectedMember.username : "Messages"}
            </h2>
          </div>

          {/* Content Area */}
          {!selectedMember ? (
            // Team Members List
            <ScrollArea className="h-[calc(100vh-5rem)] p-4 pb-16">
              <div className="space-y-2">
                {teamError ? (
                  <div className="text-center text-muted-foreground py-8">
                    {teamError instanceof Error ? teamError.message : "Failed to load team members"}
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No team members available
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 hover:bg-accent rounded-lg cursor-pointer"
                      onClick={() => setSelectedMember(member)}
                    >
                      <Avatar>
                        <AvatarImage
                          src={member.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.username}`}
                          alt={member.username}
                        />
                        <AvatarFallback>
                          {member.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className={unreadMessages[member.id] ? 'font-extrabold' : 'font-normal'}>
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
            <div className="flex flex-col h-[calc(100vh-5rem)]">
              {/* Messages List */}
              <ScrollArea className="flex-1 p-4 pb-52">
                <div className="space-y-4 mt-16">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender.id === user?.id ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.sender.id !== user?.id && (
                        <Avatar className="mr-2">
                          <AvatarImage
                            src={message.sender.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${message.sender.username}`}
                            alt={message.sender.username || "Unknown User"}
                          />
                          <AvatarFallback>
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
                          <p className="break-words">{message.content}</p>
                        )}
                        {/* Check both imageUrl and mediaUrl fields */}
                        {(message.imageUrl || message.mediaUrl) && (
                          <img
                            src={message.mediaUrl || message.imageUrl}
                            alt="Message image"
                            className="max-w-full rounded mt-2"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t bg-background fixed bottom-[80px] left-0 right-0 z-[99999]">
                {/* Use the MessageForm component instead of the Input + Button */}
                <MessageForm 
                  onSubmit={async (content, imageData) => {
                    // Update messageText and pastedImage before submitting
                    setMessageText(content);
                    setPastedImage(imageData || null);
                    // Wait for state to update and then submit
                    setTimeout(() => handleSendMessage(), 0);
                  }}
                  isSubmitting={createMessageMutation.isPending}
                  placeholder="Enter message"
                  defaultValue={messageText}
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}