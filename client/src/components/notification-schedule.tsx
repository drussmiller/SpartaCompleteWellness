import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, WifiOff, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useNotifications } from "@/hooks/use-notifications";
import { Badge } from "@/components/ui/badge";

interface NotificationScheduleProps {
  onClose: () => void;
}

export function NotificationSchedule({ onClose }: NotificationScheduleProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { connectionStatus } = useNotifications();
  const [notificationTime, setNotificationTime] = useState("09:00");

  const updateScheduleMutation = useMutation({
    mutationFn: async (time: string) => {
      const response = await apiRequest("POST", "/api/users/notification-schedule", {
        notificationTime: time
      });
      if (!response.ok) {
        throw new Error("Failed to update notification schedule");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        description: "Notification schedule updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateScheduleMutation.mutate(notificationTime);
  };

  // Generate the connection status badge
  const renderConnectionStatus = () => {
    switch (connectionStatus) {
      case "connected":
        return (
          <Badge variant="outline" className="ml-auto flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
            <Wifi className="h-3 w-3" />
            <span>Connected</span>
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="outline" className="ml-auto flex items-center gap-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            <Wifi className="h-3 w-3" />
            <span>Connecting...</span>
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="outline" className="ml-auto flex items-center gap-1 bg-red-50 text-red-700 border-red-200">
            <WifiOff className="h-3 w-3" />
            <span>Offline</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center p-4 pt-16 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="mr-2 scale-125"
        >
          <ChevronLeft className="h-8 w-8 scale-125" />
        </Button>
        <h2 className="text-lg font-semibold">Notification Schedule</h2>
        {renderConnectionStatus()}
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="notification-time">Daily Notification Time</Label>
          <Input
            id="notification-time"
            type="time"
            value={notificationTime}
            onChange={(e) => setNotificationTime(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            You will receive notifications at this time:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
            <li>Tuesday through Sunday: If you haven't posted all 3 meals the previous day</li>
            <li>Tuesday through Saturday: If you haven't posted your workout the previous day (up to 5 workouts per week)</li>
            <li>Monday through Sunday: If you haven't posted your scripture reading the previous day</li>
            <li>Sunday: If you haven't posted your memory verse on Saturday</li>
          </ul>
        </div>

        <div className="space-y-4">
          <div className="border rounded-md p-4 bg-muted/30">
            <h3 className="text-sm font-medium mb-2">Real-time notifications</h3>
            <p className="text-sm text-muted-foreground">
              {connectionStatus === "connected" 
                ? "You'll receive real-time notifications when you're online."
                : "Connect to receive real-time notifications."}
            </p>
          </div>

          <Button 
            className="w-full"
            onClick={handleSave}
            disabled={updateScheduleMutation.isPending}
          >
            Save Schedule
          </Button>
          
          {/* Debug button for testing notifications */}
          {user?.isAdmin && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium mb-2">Admin Controls</h3>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  size="sm"
                  onClick={async () => {
                    if (!user) return;
                    
                    try {
                      // Get the browser's timezone offset in minutes
                      const tzOffset = new Date().getTimezoneOffset();
                      
                      toast({
                        title: "Testing notifications",
                        description: "Sending a test notification request...",
                      });
                      
                      const response = await fetch(`/api/check-daily-scores?userId=${user.id}&tzOffset=${tzOffset}`);
                      
                      if (!response.ok) {
                        throw new Error(`Failed to send test notification: ${response.statusText}`);
                      }
                      
                      const data = await response.json();
                      
                      toast({
                        description: "Test notification sent successfully!",
                      });
                      
                      console.log("Test notification response:", data);
                    } catch (error) {
                      console.error("Error sending test notification:", error);
                      toast({
                        title: "Error",
                        description: error instanceof Error ? error.message : "Failed to send test notification",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Test Daily Notification
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  size="sm"
                  onClick={async () => {
                    if (!user) return;
                    
                    try {
                      toast({
                        title: "Testing",
                        description: "Sending a test push notification...",
                      });
                      
                      // Create a test notification
                      const notification = new Notification("Test Notification", {
                        body: "This is a test notification with sound",
                        icon: "/notification-icon.png"
                      });
                      
                      // Play the notification sound manually
                      const audio = new Audio("/notification.wav");
                      await audio.play();
                      
                      toast({
                        description: "Test push notification sent successfully!",
                      });
                    } catch (error) {
                      console.error("Error sending test push notification:", error);
                      
                      if (Notification.permission !== "granted") {
                        // Ask for permission if we don't have it
                        Notification.requestPermission().then(permission => {
                          if (permission === "granted") {
                            toast({
                              description: "Permission granted! Try the test again.",
                            });
                          } else {
                            toast({
                              title: "Permission denied",
                              description: "You need to allow notifications in your browser settings.",
                              variant: "destructive",
                            });
                          }
                        });
                      } else {
                        toast({
                          title: "Error",
                          description: error instanceof Error ? error.message : "Failed to send test notification",
                          variant: "destructive",
                        });
                      }
                    }
                  }}
                >
                  Test Push Notification
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}