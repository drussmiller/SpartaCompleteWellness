import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, WifiOff, Wifi } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  
  const testNotificationTimeMutation = useMutation({
    mutationFn: async () => {
      try {
        // Extract hour and minute from notification time
        const [hour, minute] = notificationTime.split(':').map(Number);
        
        // Validate time values
        if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          throw new Error("Invalid notification time. Please use the format HH:MM.");
        }
        
        // Set timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        // Track request start time for logging/debugging
        const requestStartTime = Date.now();
        console.log(`Starting notification test request at ${new Date().toISOString()}`);
        
        try {
          const response = await fetch(
            `/api/test-notification?hour=${hour}&minute=${minute}`, 
            { signal: controller.signal }
          );
          
          const requestDuration = Date.now() - requestStartTime;
          console.log(`Notification test request completed in ${requestDuration}ms`);
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            // Try to get detailed error information if available
            let errorMessage = "Failed to test notification time";
            try {
              const errorData = await response.json();
              errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
              console.error("Error parsing error response:", parseError);
              // Fallback to status text if JSON parsing fails
              errorMessage = response.statusText || errorMessage;
            }
            throw new Error(errorMessage);
          }
          
          return response.json();
        } catch (fetchError) {
          // Make sure to clear timeout if fetch fails
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (err) {
        // Handle different error types with customized messages
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            console.warn("Notification test request timed out after 15 seconds");
            throw new Error("Request timed out. The notification test may still be processing in the background.");
          } else if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
            console.error("Network error during notification test:", err);
            throw new Error("Network error. Please check your connection and try again.");
          }
        }
        console.error("Error in notification test:", err);
        throw err;
      }
    },
    onSuccess: (data) => {
      console.log("Test notification response:", data);
      if (data.totalNotifications > 0) {
        toast({
          title: "Notification Test Successful",
          description: `Sent ${data.totalNotifications} test notification(s) for time ${notificationTime}`,
        });
      } else {
        toast({
          title: "Test Complete",
          description: `No notifications sent. Your notification time ${notificationTime} doesn't match the test time.`,
        });
      }
      
      // Add a slight delay to prevent UI issues after notification test
      setTimeout(() => {
        // Refresh notifications to ensure we're showing the latest
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      }, 500);
    },
    onError: (error: Error) => {
      console.error("Test notification error:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    // Add retry with exponential backoff
    retry: 0, // Don't retry - we'll handle errors directly
  });

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
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center p-4 pt-16 border-b shrink-0 bg-background sticky top-0 z-20">
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

      <div className="p-6 space-y-6 pb-24 overflow-y-auto">
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
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Test Notifications</h3>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                size="sm"
                onClick={() => {
                  // Prevent starting a new test if one is already in progress
                  if (testNotificationTimeMutation.isPending) {
                    toast({
                      title: "Test in progress",
                      description: "Please wait for the current test to complete."
                    });
                    return;
                  }
                  
                  // Provide user feedback immediately
                  toast({
                    description: "Starting notification test...",
                  });
                  
                  // Use a try-catch block to handle any synchronous errors
                  try {
                    // The mutation's async errors will be handled by the onError callback
                    testNotificationTimeMutation.mutate(undefined, {
                      // Add additional error handling here to ensure UI recovery
                      onSettled: () => {
                        // Force update notification list regardless of outcome
                        setTimeout(() => {
                          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
                        }, 1000);
                      }
                    });
                  } catch (error) {
                    console.error("Error triggering test notification:", error);
                    toast({
                      title: "Error",
                      description: "Failed to send test notification. Please try again.",
                      variant: "destructive"
                    });
                  }
                }}
                disabled={testNotificationTimeMutation.isPending}
              >
                {testNotificationTimeMutation.isPending 
                  ? "Testing..." 
                  : `Test At My Scheduled Time (${notificationTime})`}
              </Button>
              
              {user?.isAdmin && (
                <>
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
                        
                        // Track request start time for logging/debugging
                        const requestStartTime = Date.now();
                        console.log(`Starting daily score check at ${new Date().toISOString()}`);
                        
                        // Set timeout to prevent hanging requests
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
                        
                        try {
                          const response = await fetch(
                            `/api/check-daily-scores?userId=${user.id}&tzOffset=${tzOffset}`,
                            { signal: controller.signal }
                          );
                          
                          const requestDuration = Date.now() - requestStartTime;
                          console.log(`Daily score check completed in ${requestDuration}ms`);
                          
                          clearTimeout(timeoutId);
                          
                          if (!response.ok) {
                            // Try to get detailed error information if available
                            let errorMessage = `Failed to send test notification: ${response.status} ${response.statusText}`;
                            try {
                              const errorData = await response.json();
                              errorMessage = errorData.message || errorMessage;
                            } catch (parseError) {
                              console.error("Error parsing error response:", parseError);
                            }
                            throw new Error(errorMessage);
                          }
                          
                          const data = await response.json();
                          
                          toast({
                            description: "Test notification sent successfully!",
                          });
                          
                          console.log("Test notification response:", data);
                          
                          // Add a slight delay to prevent UI issues after notification test
                          setTimeout(() => {
                            // Refresh notifications to ensure we're showing the latest
                            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                          }, 500);
                        } catch (fetchError) {
                          // Make sure to clear timeout if fetch fails
                          clearTimeout(timeoutId);
                          throw fetchError;
                        }
                      } catch (err) {
                        // Handle different error types with customized messages
                        if (err instanceof Error) {
                          if (err.name === 'AbortError') {
                            console.error("Daily score check request timed out after 15 seconds");
                            toast({
                              title: "Request Timed Out",
                              description: "The request took too long, but the notification might still be processing in the background.",
                              variant: "destructive"
                            });
                            return;
                          } else if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
                            console.error("Network error during daily score check:", err);
                            toast({
                              title: "Network Error",
                              description: "Please check your connection and try again.",
                              variant: "destructive"
                            });
                            return;
                          }
                        }
                        
                        console.error("Error sending test notification:", err);
                        toast({
                          title: "Error",
                          description: err instanceof Error ? err.message : "Failed to send test notification",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Debug: Test Daily Score Check
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
                        
                        // Check if browser supports notifications
                        if (!("Notification" in window)) {
                          throw new Error("This browser does not support desktop notifications");
                        }
                        
                        // Check permission status
                        if (Notification.permission === "denied") {
                          throw new Error("Notification permission has been denied. Please enable notifications in your browser settings.");
                        }
                        
                        // Request permission if needed
                        if (Notification.permission !== "granted") {
                          console.log("Requesting notification permission");
                          const permission = await Notification.requestPermission();
                          
                          if (permission !== "granted") {
                            throw new Error("Notification permission not granted");
                          }
                          
                          // Show a message that permission was granted
                          toast({
                            description: "Notification permission granted! Sending test notification...",
                          });
                        }
                        
                        // Log actions for debugging
                        console.log("Creating test notification");
                        
                        // Create a test notification with error handling
                        try {
                          const notification = new Notification("Test Notification", {
                            body: "This is a test notification with sound",
                            icon: "/notification-icon.png"
                          });
                          
                          // Set up notification events
                          notification.onclick = () => {
                            console.log("Notification clicked");
                            window.focus();
                            notification.close();
                          };
                          
                          notification.onshow = () => {
                            console.log("Notification shown");
                          };
                          
                          notification.onerror = (event) => {
                            console.error("Notification error:", event);
                            throw new Error("Error showing notification");
                          };
                        } catch (notificationError) {
                          console.error("Error creating notification:", notificationError);
                          throw new Error(`Failed to create notification: ${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`);
                        }
                        
                        // Play the notification sound manually with error handling
                        try {
                          console.log("Playing notification sound");
                          const audio = new Audio("/notification.wav");
                          
                          // Add error handling for audio
                          audio.onerror = (event) => {
                            console.error("Audio error:", event);
                            throw new Error("Failed to play notification sound");
                          };
                          
                          await audio.play();
                        } catch (audioError) {
                          console.warn("Error playing notification sound:", audioError);
                          // Don't fail the whole operation if just the sound fails
                          toast({
                            description: "Notification sent, but sound couldn't be played.",
                          });
                          return;
                        }
                        
                        toast({
                          description: "Test push notification sent successfully!",
                        });
                      } catch (error) {
                        console.error("Error sending test push notification:", error);
                        
                        // More detailed error handling based on error type
                        if (Notification.permission !== "granted") {
                          toast({
                            title: "Permission Required",
                            description: "Notification permission is required. Please enable notifications in your browser settings.",
                            variant: "destructive",
                          });
                        } else if (error instanceof Error && error.message.includes("play")) {
                          toast({
                            title: "Sound Error",
                            description: "Notification was sent but sound couldn't be played. This may require user interaction first.",
                            variant: "destructive",
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
                    Debug: Test Push Notification
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}