import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAchievements } from "@/hooks/use-achievements";
import { Switch } from "@/components/ui/switch";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";

interface NotificationSettingsProps {
  onClose: () => void;
}

export function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const { toast } = useToast();
  const { notificationsEnabled, setNotificationsEnabled } = useAchievements();
  const [notificationTime, setNotificationTime] = useState("09:00");

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: onClose
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (time: string) => {
      const response = await apiRequest(
        "POST",
        "/api/users/notification-schedule",
        {
          notificationTime: time,
        },
      );
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
        const [hour, minute] = notificationTime.split(":").map(Number);

        // Validate time values
        if (
          isNaN(hour) ||
          isNaN(minute) ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          throw new Error(
            "Invalid notification time. Please use the format HH:MM.",
          );
        }

        // Set timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        // Track request start time for logging/debugging
        const requestStartTime = Date.now();
        console.log(
          `Starting notification test request at ${new Date().toISOString()}`,
        );

        try {
          const response = await fetch(
            `/api/test-notification?hour=${hour}&minute=${minute}`,
            { signal: controller.signal },
          );

          const requestDuration = Date.now() - requestStartTime;
          console.log(
            `Notification test request completed in ${requestDuration}ms`,
          );

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
          if (err.name === "AbortError") {
            console.warn(
              "Notification test request timed out after 15 seconds",
            );
            throw new Error(
              "Request timed out. The notification test may still be processing in the background.",
            );
          } else if (
            err.name === "TypeError" &&
            err.message.includes("Failed to fetch")
          ) {
            console.error("Network error during notification test:", err);
            throw new Error(
              "Network error. Please check your connection and try again.",
            );
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

  return (
    <div 
      className="flex flex-col h-full overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-center p-4 pt-16 border-b shrink-0 bg-background sticky top-0 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="mr-2 scale-125"
        >
          <ChevronLeft className="h-8 w-8 scale-125" />
        </Button>
        <h2 className="text-lg font-semibold">Notification Settings</h2>
      </div>

      <div 
        className="p-6 space-y-6 pb-24 overflow-y-auto"
      >
        {/* Achievement notification toggle */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Achievement Notifications</h3>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="achievement-notifications"
              className="text-lg text-muted-foreground"
            >
              Show achievement popups
            </Label>
            <Switch
              id="achievement-notifications"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>
          <p className="text-base text-muted-foreground mt-1">
            {notificationsEnabled
              ? "Achievement notifications are enabled. You will see popups when you earn achievements."
              : "Achievement notifications are disabled. You will still earn achievements but will not see popups."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notification-time" className="text-lg">
            Daily Notification Time
          </Label>
          <Input
            id="notification-time"
            type="time"
            className="text-lg"
            value={notificationTime}
            onChange={(e) => setNotificationTime(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            You will receive notifications at this time:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-base text-muted-foreground">
            <li>
              Tuesday through Sunday: If you haven't posted all 3 meals the
              previous day
            </li>
            <li>
              Tuesday through Saturday: If you haven't posted your workout the
              previous day (up to 5 workouts per week)
            </li>
            <li>
              Monday through Sunday: If you haven't posted your scripture
              reading the previous day
            </li>
            <li>Sunday: If you haven't posted your memory verse on Saturday</li>
          </ul>
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={updateScheduleMutation.isPending}
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
}
