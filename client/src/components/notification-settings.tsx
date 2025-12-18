import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NotificationSettingsProps {
  onClose: () => void;
}

export function NotificationSettings({ onClose }: NotificationSettingsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { notificationsEnabled, setNotificationsEnabled } = useAchievements();
  const [hour, setHour] = useState("9");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [dailyNotificationsEnabled, setDailyNotificationsEnabled] = useState(true);
  const [confirmationMessagesEnabled, setConfirmationMessagesEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: onClose
  });

  // Suppress console warnings about dialog accessibility
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('DialogTitle') || args[0].includes('aria-describedby'))
      ) {
        return;
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  // Load user's saved notification time and daily notifications enabled setting
  useEffect(() => {
    if (user?.notificationTime) {
      const [savedHour, savedMinute] = user.notificationTime.split(':');
      const hourNum = parseInt(savedHour);

      if (hourNum === 0) {
        setHour("12");
        setPeriod("AM");
      } else if (hourNum < 12) {
        setHour(hourNum.toString());
        setPeriod("AM");
      } else if (hourNum === 12) {
        setHour("12");
        setPeriod("PM");
      } else {
        setHour((hourNum - 12).toString());
        setPeriod("PM");
      }
    }
    
    // Load daily notifications enabled state
    if (user?.dailyNotificationsEnabled !== undefined && user?.dailyNotificationsEnabled !== null) {
      setDailyNotificationsEnabled(user.dailyNotificationsEnabled);
    }
    
    // Load confirmation messages enabled state
    if (user?.confirmationMessagesEnabled !== undefined && user?.confirmationMessagesEnabled !== null) {
      setConfirmationMessagesEnabled(user.confirmationMessagesEnabled);
      // Also set in localStorage so toast system can access it
      localStorage.setItem('confirmationMessagesEnabled', user.confirmationMessagesEnabled.toString());
    }
    
    // Load SMS settings
    if (user?.smsEnabled !== undefined && user?.smsEnabled !== null) {
      setSmsEnabled(user.smsEnabled);
    }
  }, [user?.notificationTime, user?.dailyNotificationsEnabled, user?.confirmationMessagesEnabled, user?.smsEnabled]);

  // Convert hour + period to 24-hour format (always at :00 minutes)
  const convertTo24Hour = (hour: string, period: "AM" | "PM"): string => {
    let hourNum = parseInt(hour);
    if (period === "PM" && hourNum !== 12) {
      hourNum += 12;
    } else if (period === "AM" && hourNum === 12) {
      hourNum = 0;
    }
    return `${String(hourNum).padStart(2, '0')}:00`;
  };

  const updateScheduleMutation = useMutation({
    mutationFn: async (updates: {
      notificationTime?: string;
      dailyNotificationsEnabled?: boolean;
      confirmationMessagesEnabled?: boolean;
      smsEnabled?: boolean;
    }) => {
      // Get user's timezone offset in minutes
      const timezoneOffset = new Date().getTimezoneOffset();

      const response = await apiRequest(
        "POST",
        "/api/users/notification-schedule",
        {
          notificationTime: updates.notificationTime,
          timezoneOffset: -timezoneOffset, // Negate because getTimezoneOffset returns opposite sign
          achievementNotificationsEnabled: notificationsEnabled,
          dailyNotificationsEnabled: updates.dailyNotificationsEnabled !== undefined 
            ? updates.dailyNotificationsEnabled 
            : dailyNotificationsEnabled,
          confirmationMessagesEnabled: updates.confirmationMessagesEnabled !== undefined
            ? updates.confirmationMessagesEnabled
            : confirmationMessagesEnabled,
          smsEnabled: updates.smsEnabled !== undefined ? updates.smsEnabled : smsEnabled,
        },
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update notification schedule");
      }
      return response.json();
    },
    onSuccess: () => {
      // Refresh user data to get updated settings
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: Error, variables) => {
      // Restore previous state if SMS toggle failed
      if (variables.smsEnabled !== undefined && user?.smsEnabled !== undefined && user.smsEnabled !== null) {
        setSmsEnabled(user.smsEnabled);
      }
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-save when time changes
  const handleTimeChange = (newHour: string, newPeriod: "AM" | "PM") => {
    const time = convertTo24Hour(newHour, newPeriod);
    updateScheduleMutation.mutate({ notificationTime: time });
  };

  // Auto-save when daily notifications toggle changes
  const handleDailyNotificationsChange = (enabled: boolean) => {
    setDailyNotificationsEnabled(enabled);
    updateScheduleMutation.mutate({ dailyNotificationsEnabled: enabled });
  };

  // Auto-save when confirmation messages toggle changes
  const handleConfirmationMessagesChange = (enabled: boolean) => {
    setConfirmationMessagesEnabled(enabled);
    updateScheduleMutation.mutate({ confirmationMessagesEnabled: enabled });
    
    // Store in localStorage so toast system can check it
    localStorage.setItem('confirmationMessagesEnabled', enabled.toString());
  };

  // Auto-save when SMS toggle changes
  const handleSmsEnabledChange = (enabled: boolean) => {
    // Validate on client side before attempting to enable
    if (enabled) {
      if (!user?.phoneNumber) {
        toast({
          title: "Phone Number Required",
          description: "Please add a phone number in your profile before enabling SMS notifications.",
          variant: "destructive",
        });
        return;
      }
      
      // Basic validation: must be at least 10 digits
      const digitsOnly = user.phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        toast({
          title: "Invalid Phone Number",
          description: "Please update your phone number in your profile. It must have at least 10 digits.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Optimistically update UI
    setSmsEnabled(enabled);
    updateScheduleMutation.mutate({ smsEnabled: enabled });
  };

  const testNotificationTimeMutation = useMutation({
    mutationFn: async () => {
      try {
        // Convert to 24-hour format
        const time24 = convertTo24Hour(hour, period);
        const [hourNum, minute] = time24.split(":").map(Number);

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
            `/api/test-notification?hour=${hourNum}&minute=${minute}`,
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
      const displayTime = `${hour}:00 ${period}`;
      if (data.totalNotifications > 0) {
        toast({
          title: "Notification Test Successful",
          description: `Sent ${data.totalNotifications} test notification(s) for time ${displayTime}`,
        });
      } else {
        toast({
          title: "Test Complete",
          description: `No notifications sent. Your notification time ${displayTime} doesn't match the test time.`,
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
      <div className="flex items-center p-4 pt-16 border-b shrink-0 bg-background sticky top-0 z-[60]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="mr-2 scale-125"
        >
          <ChevronLeft className="h-8 w-8 scale-125" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground">Notification Settings</h2>
      </div>

      <div
        className="p-6 space-y-6 pb-24 overflow-y-auto"
      >
        {/* Confirmation Messages toggle */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Confirmation Messages</h3>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="confirmation-messages"
              className="text-lg text-muted-foreground"
            >
              Show success messages
            </Label>
            <Switch
              id="confirmation-messages"
              checked={confirmationMessagesEnabled}
              onCheckedChange={handleConfirmationMessagesChange}
            />
          </div>
          <p className="text-base text-muted-foreground mt-1">
            {confirmationMessagesEnabled
              ? "You will see confirmation messages when you complete actions (e.g., 'Message sent successfully')."
              : "Confirmation messages are disabled. Actions will complete silently without pop-up messages."}
          </p>
        </div>

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

        {/* Daily Notifications toggle */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">Daily Reminders</h3>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="daily-notifications"
              className="text-lg text-muted-foreground"
            >
              Enable daily notifications
            </Label>
            <Switch
              id="daily-notifications"
              checked={dailyNotificationsEnabled}
              onCheckedChange={handleDailyNotificationsChange}
            />
          </div>
          <p className="text-base text-muted-foreground mt-1">
            {dailyNotificationsEnabled
              ? "Daily reminder notifications are enabled. You will receive notifications if you miss posts."
              : "Daily reminder notifications are disabled. You won't receive any daily reminder notifications."}
          </p>
        </div>

        {/* SMS Notifications section */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">SMS Notifications</h3>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="sms-enabled"
              className="text-lg text-muted-foreground"
            >
              Enable SMS notifications
            </Label>
            <Switch
              id="sms-enabled"
              checked={smsEnabled}
              onCheckedChange={handleSmsEnabledChange}
              disabled={!user?.phoneNumber}
              data-testid="toggle-sms-enabled"
            />
          </div>
          <p className="text-base text-muted-foreground mt-1">
            {smsEnabled
              ? dailyNotificationsEnabled
                ? "SMS notifications are enabled. You will receive text messages for daily reminders and important alerts."
                : "SMS notifications are enabled. You will receive text messages for important alerts."
              : dailyNotificationsEnabled
                ? "SMS notifications are disabled. Enable to receive text messages for daily reminders."
                : "SMS notifications are disabled. Enable to receive text messages for important alerts."}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-lg">
            Daily Notification Time
          </Label>
          <div className="flex gap-2 justify-center items-center">
            <Select value={hour} onValueChange={(newHour) => {
              setHour(newHour);
              handleTimeChange(newHour, period);
            }}>
              <SelectTrigger className="w-20 text-lg">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {[...Array(12)].map((_, i) => {
                  const h = i + 1;
                  return (
                    <SelectItem key={h} value={h.toString()}>
                      {h}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => {
              const newPeriod = v as "AM" | "PM";
              setPeriod(newPeriod);
              handleTimeChange(hour, newPeriod);
            }}>
              <SelectTrigger className="w-24 text-lg">
                <SelectValue placeholder="AM/PM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Notifications will be sent on the hour (at {hour}:00 {period}):
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
      </div>
    </div>
  );
}