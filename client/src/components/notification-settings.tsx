import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  Smartphone,
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
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [smsEnabled, setSmsEnabled] = useState(user?.smsEnabled || false);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: onClose
  });

  // Load user's saved notification time
  useState(() => {
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
  });

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
    mutationFn: async () => {
      const time = convertTo24Hour(hour, period);
      // Get user's timezone offset in minutes
      const timezoneOffset = new Date().getTimezoneOffset();
      
      const response = await apiRequest(
        "POST",
        "/api/users/notification-schedule",
        {
          notificationTime: time,
          timezoneOffset: -timezoneOffset, // Negate because getTimezoneOffset returns opposite sign
          achievementNotificationsEnabled: notificationsEnabled,
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
      // Refresh user data to get updated settings
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
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
    updateScheduleMutation.mutate();
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

  const testSMSMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/sms/test", {
        phoneNumber,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to test SMS");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "SMS Test Successful!",
        description: `Carrier detected: ${data.gateway}. Check your phone for the test message.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      setSmsEnabled(true);
    },
    onError: (error: Error) => {
      toast({
        title: "SMS Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSMSSettingsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/user/sms", {
        phoneNumber,
        smsEnabled,
      });
      if (!response.ok) {
        throw new Error("Failed to update SMS settings");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        description: "SMS settings updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
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
          <Label className="text-lg">
            Daily Notification Time
          </Label>
          <div className="flex gap-2 justify-center items-center">
            <Select value={hour} onValueChange={setHour}>
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
            <Select value={period} onValueChange={(v) => setPeriod(v as "AM" | "PM")}>
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

        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <h3 className="text-lg font-medium">SMS Text Notifications</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone-number" className="text-lg">
                Phone Number
              </Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="(555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-lg"
                data-testid="input-phone-number"
              />
              <p className="text-sm text-muted-foreground">
                Enter your 10-digit phone number to receive SMS notifications
              </p>
            </div>

            {user?.smsCarrierGateway && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm font-medium">Carrier Detected</p>
                <p className="text-sm text-muted-foreground">
                  {user.smsCarrierGateway}
                </p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => testSMSMutation.mutate()}
              disabled={!phoneNumber || testSMSMutation.isPending}
              variant="outline"
              data-testid="button-test-sms"
            >
              {testSMSMutation.isPending ? "Testing..." : "Test SMS & Detect Carrier"}
            </Button>

            <div className="flex items-center justify-between">
              <Label htmlFor="sms-enabled" className="text-lg">
                Enable SMS Notifications
              </Label>
              <Switch
                id="sms-enabled"
                checked={smsEnabled}
                onCheckedChange={setSmsEnabled}
                disabled={!user?.smsCarrierGateway}
                data-testid="switch-sms-enabled"
              />
            </div>
            
            {!user?.smsCarrierGateway && (
              <p className="text-sm text-amber-600">
                Test SMS first to detect your carrier before enabling notifications
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              SMS notifications work by sending emails to your carrier's SMS gateway. 
              We'll automatically detect which carrier you use (Verizon, AT&T, T-Mobile, etc.) 
              when you test your number.
            </p>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => {
            handleSave();
            if (phoneNumber && (smsEnabled !== user?.smsEnabled)) {
              updateSMSSettingsMutation.mutate();
            }
          }}
          disabled={updateScheduleMutation.isPending || updateSMSSettingsMutation.isPending}
          data-testid="button-save-settings"
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
}
