import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Clock, Calendar, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NotificationSchedulerProps {
  onClose: () => void;
}

export function NotificationScheduler({ onClose }: NotificationSchedulerProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [notificationTime, setNotificationTime] = useState("09:00");
  const [notifications, setNotifications] = useState<Array<{ id: string, type: string, enabled: boolean, label: string, description: string }>>([
    { id: "food", type: "daily", enabled: true, label: "Meal Reminders", description: "Reminder if you haven't posted all 3 meals the previous day (Tuesday-Sunday)" },
    { id: "workout", type: "daily", enabled: true, label: "Workout Reminders", description: "Reminder if you haven't posted your workout (Tuesday-Saturday, max 5 per week)" },
    { id: "scripture", type: "daily", enabled: true, label: "Scripture Reminders", description: "Reminder if you haven't posted your scripture reading (Monday-Sunday)" },
    { id: "memory_verse", type: "weekly", enabled: true, label: "Memory Verse Reminders", description: "Reminder if you haven't posted your memory verse (Sunday)" }
  ]);
  const [showPreview, setShowPreview] = useState(false);
  
  // Get user preferences from the server
  const { data: userPreferences, isLoading: preferencesLoading } = useQuery<{
    notificationTime?: string;
    notificationSettings?: Record<string, boolean>;
  }>({
    queryKey: ["/api/users/notification-preferences"],
    enabled: !!user,
    refetchOnWindowFocus: false
  });
  
  // Update local state when we get preferences from the server
  useEffect(() => {
    if (userPreferences?.notificationTime) {
      setNotificationTime(userPreferences.notificationTime);
    }
    
    // If we get preferences for specific notification types
    if (userPreferences?.notificationSettings) {
      // Update our local state to match the server settings
      setNotifications(prev => prev.map(notification => ({
        ...notification,
        enabled: userPreferences.notificationSettings?.[notification.id] ?? notification.enabled
      })));
    }
  }, [userPreferences]);

  // Save preferences mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async ({
      time,
      settings
    }: {
      time: string;
      settings: Record<string, boolean>;
    }) => {
      const response = await apiRequest("POST", "/api/users/notification-preferences", {
        notificationTime: time,
        notificationSettings: settings
      });
      
      if (!response.ok) {
        throw new Error("Failed to update notification settings");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        description: "Notification schedule updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/notification-preferences"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle saving preferences
  const handleSave = () => {
    // Create settings object with enabled status for each notification type
    const settings = notifications.reduce(
      (acc, { id, enabled }) => ({ ...acc, [id]: enabled }),
      {}
    );
    
    updateScheduleMutation.mutate({
      time: notificationTime,
      settings
    });
  };
  
  // Toggle notification type
  const toggleNotification = (id: string) => {
    setNotifications(notifications.map(notification => 
      notification.id === id 
        ? { ...notification, enabled: !notification.enabled } 
        : notification
    ));
  };
  
  // Get the current day for the preview
  const getCurrentDay = (): string => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[new Date().getDay()];
  };
  
  // Get tomorrow's day name
  const getTomorrowDay = (): string => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return days[tomorrow.getDay()];
  };
  
  // Get reminders for current day
  const getDailyReminders = () => {
    const today = getCurrentDay();
    const tomorrow = getTomorrowDay();
    
    // Filter notifications based on the current day
    const filtered = notifications.filter(notification => {
      if (!notification.enabled) return false;
      
      switch (notification.id) {
        case "food":
          // No food reminders on Sunday (checking Saturday's posts)
          return today !== "Sunday";
        case "workout":
          // No workout reminders on Sunday or Monday (checking Saturday's or Sunday's posts)
          return today !== "Sunday" && today !== "Monday";
        case "scripture":
          // Scripture reminders every day
          return true;
        case "memory_verse":
          // Memory verse reminder only on Sunday (checking Saturday's post)
          return today === "Sunday";
        default:
          return false;
      }
    });
    
    return filtered.map(notification => ({
      ...notification,
      title: `${notification.label.replace(" Reminders", "")} Reminder`,
      message: notification.id === "memory_verse"
        ? `Don't forget to post your Memory Verse today (${tomorrow})!`
        : `You didn't complete all your ${notification.label.replace(" Reminders", "").toLowerCase()} posts yesterday.`
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
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
      </div>

      <div className="p-6 space-y-6 pb-24 overflow-y-auto">
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            When to Notify
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose what time of day you want to receive notifications. You'll only receive one notification per day.
          </p>
          
          <div className="flex items-end gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="notification-time">Daily Notification Time</Label>
              <Input
                id="notification-time"
                type="time"
                value={notificationTime}
                onChange={(e) => setNotificationTime(e.target.value)}
              />
            </div>
            
            <Badge variant="outline" className="mb-1 shrink-0">
              {notificationTime ? 
                new Date(`2000-01-01T${notificationTime}`).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }) 
                : "Not set"}
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground mt-1">
            Notifications will be sent within a 10-minute window of your selected time.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            What to Notify
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose which reminders you want to receive. You'll only get notifications for the enabled types.
          </p>
          
          <div className="space-y-3 mt-3">
            {notifications.map((notification) => (
              <div 
                key={notification.id}
                className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{notification.label}</h4>
                    <Badge variant="outline" className="text-xs">
                      {notification.type === "daily" ? "Daily" : "Weekly"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {notification.description}
                  </p>
                </div>
                <Switch 
                  checked={notification.enabled}
                  onCheckedChange={() => toggleNotification(notification.id)}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Preview Card */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Preview Notifications
            </h3>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? "Hide Preview" : "Show Preview"}
            </Button>
          </div>
          
          {showPreview && (
            <div className="space-y-3 mt-3">
              {getDailyReminders().length === 0 ? (
                <div className="p-4 border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                  No notifications will be sent today based on your settings.
                </div>
              ) : (
                getDailyReminders().map((reminder, idx) => (
                  <Card key={idx} className="border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{reminder.title}</CardTitle>
                      <CardDescription className="text-xs">
                        Sent at {new Date(`2000-01-01T${notificationTime}`).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm">{reminder.message}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
        
        <Button 
          className="w-full mt-6"
          onClick={handleSave}
          disabled={updateScheduleMutation.isPending}
        >
          {updateScheduleMutation.isPending ? "Saving..." : "Save Schedule"}
        </Button>
      </div>
    </div>
  );
}