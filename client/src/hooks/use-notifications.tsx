import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  // Temporarily disable WebSocket connection
  useEffect(() => {
    console.log("WebSocket connection temporarily disabled for debugging");
    return () => {
      console.log("Cleanup WebSocket connection");
    };
  }, [user]);

  return { connectionStatus };
}