import { useState, useEffect } from "react";
import { MessageCircle, ChevronLeft, Send, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  id: number;
  username: string;
  imageUrl?: string;
  isAdmin: boolean;
  teamId: number | null;
}

interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  type: 'text' | 'image' | 'video';
  createdAt: string;
}

export function MessageSlideCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [messageText, setMessageText] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for team members
  const { data: teamMembers = [], error: teamError } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members", user?.teamId],
    queryFn: async () => {
      if (!user?.teamId) {
        throw new Error("No team assigned");
      }
      try {
        console.log('Fetching team members for team:', user.teamId);
        const response = await apiRequest("GET", `/api/team/${user.teamId}/members`);

        if (!response.ok) {
          let errorMessage = "Failed to fetch team members";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const errorText = await response.text().catch(() => null);
            if (errorText) errorMessage = errorText;
          }
          throw new Error(errorMessage);
        }

        const responseText = await response.text();
        console.log('Team members response:', responseText);

        try {
          const members = JSON.parse(responseText);
          // Filter out admins and the current user
          return members.filter((member: TeamMember) => 
            !member.isAdmin && member.id !== user.id && member.teamId === user.teamId
          );
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          throw new Error('Invalid response format from server');
        }
      } catch (error) {
        console.error('Team members fetch error:', error);
        throw error instanceof Error ? error : new Error("Failed to fetch team members");
      }
    },
    enabled: isOpen && !!user?.teamId,
    retry: 2
  });

  // Query for messages with selected member
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      try {
        const response = await apiRequest(
          "GET",
          `/api/messages/${selectedMember.id}`
        );

        if (!response.ok) {
          let errorMessage = "Failed to fetch messages";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const errorText = await response.text().catch(() => null);
            if (errorText) errorMessage = errorText;
          }
          throw new Error(errorMessage);
        }

        const responseText = await response.text();
        console.log('Messages response:', responseText);

        try {
          return JSON.parse(responseText);
        } catch (parseError) {
          console.error('Messages JSON parse error:', parseError);
          throw new Error('Invalid message data format from server');
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
        throw error instanceof Error ? error : new Error("Failed to fetch messages");
      }
    },
    enabled: !!selectedMember,
    retry: 2
  });

  // Handle team error using useEffect
  useEffect(() => {
    if (teamError && isOpen) {
      toast({
        title: "Error",
        description: teamError instanceof Error ? teamError.message : "Failed to load team members",
        variant: "destructive",
      });
    }
  }, [teamError, isOpen, toast]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedMember) return;

    try {
      console.log('Attempting to create message:', {
        type: "text",
        content: messageText.trim(),
        recipientId: selectedMember.id
      });

      const res = await apiRequest("POST", "/api/messages", {
        content: messageText.trim(),
        recipientId: selectedMember.id,
        type: "text"
      });

      if (!res.ok) {
        let errorMessage = "Failed to send message";
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          const errorText = await res.text().catch(() => null);
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log('Message created successfully:', data);

      setMessageText("");
      // Refetch messages
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMember.id] });

      toast({
        description: "Message sent successfully",
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (type: 'image' | 'video') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'image' ? 'image/*' : 'video/*';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !selectedMember) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('recipientId', selectedMember.id.toString());
      formData.append('type', type);

      try {
        const response = await fetch('/api/messages/media', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!response.ok) {
          let errorMessage = `Failed to upload ${type}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            const errorText = await response.text().catch(() => null);
            if (errorText) errorMessage = errorText;
          }
          throw new Error(errorMessage);
        }

        // Refetch messages after successful upload
        queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedMember.id] });

        toast({
          description: "Media uploaded successfully",
        });
      } catch (error) {
        console.error("Error uploading media:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to upload media",
          variant: "destructive",
        });
      }
    };

    input.click();
  };

  return (
    <>
      <Button
        size="icon"
        className="h-10 w-10 bg-gray-200 hover:bg-gray-300 ml-2"
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="h-4 w-4 text-black font-extrabold" />
      </Button>

      {/* Full screen slide-out panel */}
      <div
        className={`fixed inset-0 bg-background transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } z-50`}
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
            <ScrollArea className="h-[calc(100vh-5rem)] p-4">
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
                        <p className="font-medium">{member.username}</p>
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
                        message.senderId === user?.id ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          message.senderId === user?.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {message.type === 'text' && (
                          <p className="break-words">{message.content}</p>
                        )}
                        {message.type === 'image' && (
                          <img
                            src={message.content}
                            alt="Message image"
                            className="max-w-full rounded"
                          />
                        )}
                        {message.type === 'video' && (
                          <video
                            src={message.content}
                            controls
                            className="max-w-full rounded"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t bg-background">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleFileUpload('image')}
                  >
                    <Image className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleFileUpload('video')}
                  >
                    <Video className="h-5 w-5" />
                  </Button>
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
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
                    disabled={!messageText.trim()}
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