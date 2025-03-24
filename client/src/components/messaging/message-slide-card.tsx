import { useState, useEffect, useCallback } from "react";
import { MessageCircle, ChevronLeft, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Post, User } from "@shared/schema";

interface Message extends Post {
  sender: User;
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
          console.log('Checking member:', {
            id: member.id,
            teamId: member.teamId,
            isAdmin: member.isAdmin,
            matchesTeam: member.teamId === user.teamId,
            isCurrentUser: member.id === user.id
          });

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
      </Button>

      {/* Full screen slide-out panel */}
      <div
        className={`fixed inset-0 bg-background transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } z-[100]`}
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
              className="mr-2"
            >
              <ChevronLeft className="h-6 w-6" />
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
                        <p className="font-bold">{member.username}</p>
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
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
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
                        {message.imageUrl && (
                          <img
                            src={message.imageUrl}
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
              <div className="p-4 pb-20 border-t bg-background">
                {pastedImage && (
                  <div className="relative w-32 h-32 mb-4">
                    <img
                      src={pastedImage}
                      alt="Pasted image"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      onClick={() => setPastedImage(null)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message... (Paste an image with Ctrl+V)"
                    className="flex-1"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={(!messageText.trim() && !pastedImage) || createMessageMutation.isPending}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}