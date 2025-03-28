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
      <div className="flex items-center p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="mr-2"
        >
          <ChevronLeft className="h-6 w-6" />
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
        </div>
      </div>
    </div>
  );
}