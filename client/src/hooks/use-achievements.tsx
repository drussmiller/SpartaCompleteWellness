import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './use-auth';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

// Achievement types
export type AchievementType =
  | 'food-streak-6'
  | 'workout-streak-5'
  | 'scripture-streak-7'
  | 'memory-verse-streak-4'
  | 'first-post'
  | 'week-complete';

// Database achievement structure
export interface DbAchievement {
  id: number;
  type: string;
  name: string;
  description: string;
  iconPath: string;
  pointValue: number;
  earnedAt: string;
  viewed?: boolean;
}

// Achievement object structure
export interface Achievement {
  id: string;
  type: AchievementType;
  title: string;
  description: string;
  iconPath: string;
  timestamp: number;
  points?: number;
  dbId?: number; // Database ID for marking as viewed
}

// Active achievement with additional properties
export interface ActiveAchievement extends Achievement {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

// Achievement context interface
interface AchievementsContextType {
  activeAchievements: ActiveAchievement[];
  showAchievement: (achievement: Achievement) => void;
  hideAchievement: (id: string) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
}

// Create the context
const AchievementsContext = createContext<AchievementsContextType>({
  activeAchievements: [],
  showAchievement: () => {},
  hideAchievement: () => {},
  notificationsEnabled: false,
  setNotificationsEnabled: () => {},
});

// Helper function to create an achievement
export function createAchievement(type: AchievementType, title?: string, description?: string, pointValue?: number): Achievement {
  // Default title and description based on achievement type
  let defaultTitle = '';
  let defaultDescription = '';
  let defaultPoints = 0;
  
  switch (type) {
    case 'food-streak-6':
      defaultTitle = 'Food Streak - 6 Days';
      defaultDescription = 'Posted food for 6 consecutive days';
      defaultPoints = 54;
      break;
    case 'workout-streak-5':
      defaultTitle = 'Workout Streak - 5 Days';
      defaultDescription = 'Posted workout for 5 consecutive days';
      defaultPoints = 15;
      break;
    case 'scripture-streak-7':
      defaultTitle = 'Scripture Streak - 7 Days';
      defaultDescription = 'Posted scripture for 7 consecutive days';
      defaultPoints = 21;
      break;
    case 'memory-verse':
      defaultTitle = 'Memory Verse';
      defaultDescription = 'Posted memory verse';
      defaultPoints = 10;
      break;
    case 'first-post':
      defaultTitle = 'First Post!';
      defaultDescription = 'You made your first post on Sparta!';
      defaultPoints = 5;
      break;
    case 'week-complete':
      defaultTitle = 'Perfect Week';
      defaultDescription = 'You completed all activities for the entire week!';
      defaultPoints = 20;
      break;
  }
  
  // Get icon path
  const iconPath = `/achievements/${type}.svg`;
  
  return {
    id: uuidv4(),
    type,
    title: title || defaultTitle,
    description: description || defaultDescription,
    iconPath,
    timestamp: Date.now(),
    points: pointValue || defaultPoints
  };
}

// Convert DbAchievement to Achievement
export function dbAchievementToAchievement(dbAchievement: DbAchievement): Achievement {
  return {
    id: uuidv4(),
    type: dbAchievement.type as AchievementType,
    title: dbAchievement.name,
    description: dbAchievement.description,
    iconPath: dbAchievement.iconPath,
    timestamp: new Date(dbAchievement.earnedAt).getTime(),
    points: dbAchievement.pointValue,
    dbId: dbAchievement.id
  };
}

// Provider component
export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeAchievements, setActiveAchievements] = useState<ActiveAchievement[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(false);
  
  // Custom setter that also updates the server
  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    // Update local state immediately for responsive UI
    setNotificationsEnabledState(enabled);
    
    // Update the server if the user is logged in
    if (user) {
      try {
        const response = await fetch('/api/users/notification-schedule', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            achievementNotificationsEnabled: enabled
          })
        });
        
        if (!response.ok) {
          console.error('Failed to update achievement notification preference on server');
        } else {
          // Invalidate the user query to ensure all components have the latest data
          queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
        }
      } catch (error) {
        console.error('Error updating achievement notification preference:', error);
      }
    }
  }, [user]);
  
  // Fetch user notification preferences and unviewed achievements
  const { data: userData } = useQuery<{ achievementNotificationsEnabled?: boolean }>({
    queryKey: ["/api/users/me"],
    enabled: !!user
  });
  
  // Update notifications state when user data changes
  useEffect(() => {
    if (userData && typeof userData.achievementNotificationsEnabled === 'boolean') {
      // Use the state setter directly to avoid triggering the server update
      setNotificationsEnabledState(userData.achievementNotificationsEnabled);
    }
  }, [userData]);
  
  // Fetch unviewed achievements
  const { data: unviewedAchievements } = useQuery<DbAchievement[]>({
    queryKey: ["/api/achievements/unviewed"],
    enabled: !!user,
  });
  
  // Get position for next achievement
  const getNextPosition = useCallback((): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' => {
    // Simple rotation of positions
    const positions: ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right')[] = [
      'top-right', 'bottom-right', 'bottom-left', 'top-left'
    ];
    
    if (activeAchievements.length === 0) return positions[0];
    
    const lastPosition = activeAchievements[activeAchievements.length - 1].position;
    const lastIndex = positions.indexOf(lastPosition);
    const nextIndex = (lastIndex + 1) % positions.length;
    
    return positions[nextIndex];
  }, [activeAchievements]);
  
  // Mark achievement as viewed
  const markAchievementAsViewed = useCallback(async (id: number) => {
    try {
      if (!user) return;
      
      await fetch(`/api/achievements/${id}/viewed`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      // Invalidate achievements query
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/unviewed"] });
    } catch (error) {
      console.error("Error marking achievement as viewed:", error);
    }
  }, [user]);
  
  // Show an achievement
  const showAchievement = useCallback((achievement: Achievement) => {
    // Don't show achievements if notifications are disabled
    // But still mark them as viewed in the database
    if (!notificationsEnabled) {
      if ('dbId' in achievement && typeof achievement.dbId === 'number') {
        markAchievementAsViewed(achievement.dbId);
      }
      return;
    }
    
    const activeAchievement: ActiveAchievement = {
      ...achievement,
      position: getNextPosition(),
    };
    
    setActiveAchievements(prev => [...prev, activeAchievement]);
    
    // Auto-hide after a delay
    setTimeout(() => {
      hideAchievement(achievement.id);
    }, 6000);
    
    // If achievement has a database ID (from dbId property), mark it as viewed
    if ('dbId' in achievement && typeof achievement.dbId === 'number') {
      markAchievementAsViewed(achievement.dbId);
    }
  }, [getNextPosition, markAchievementAsViewed, notificationsEnabled]);
  
  // Hide an achievement
  const hideAchievement = useCallback((id: string) => {
    setActiveAchievements(prev => prev.filter(a => a.id !== id));
  }, []);
  
  // Listen for WebSocket achievement events - DISABLED until WebSocket server is set up
  useEffect(() => {
    // WebSocket connection temporarily disabled to prevent reconnection loops
    // Uncomment when WebSocket server is available
    /*
    if (!user || socketRef.current) return;
    
    // Get the WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    socket.onopen = () => {
      // Authenticate with the server
      socket.send(JSON.stringify({
        type: "auth",
        userId: user.id
      }));
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle achievement messages
        if (data.type === 'achievement' && data.achievement) {
          console.log("Received achievement:", data.achievement);
          
          // Convert to Achievement format and show it (or just mark as viewed if disabled)
          const achievement: Achievement = {
            id: uuidv4(),
            type: data.achievement.type as AchievementType,
            title: data.achievement.name,
            description: data.achievement.description,
            iconPath: data.achievement.iconPath,
            timestamp: Date.now(),
            points: data.achievement.pointValue,
            dbId: data.achievement.id // Store DB ID for marking as viewed later
          };
          
          showAchievement(achievement);
        }
      } catch (error) {
        console.error("Error handling WebSocket achievement message:", error);
      }
    };
    
    socket.onclose = () => {
      socketRef.current = null;
    };
    */
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [user, showAchievement]);
  
  // Show unviewed achievements when they're loaded
  useEffect(() => {
    if (!unviewedAchievements || unviewedAchievements.length === 0 || isInitialized) return;
    
    // Mark as initialized to prevent showing achievements multiple times
    setIsInitialized(true);
    
    // Show each unviewed achievement with a slight delay between them (or just mark as viewed if disabled)
    unviewedAchievements.forEach((dbAchievement, index) => {
      setTimeout(() => {
        const achievement = dbAchievementToAchievement(dbAchievement);
        showAchievement(achievement);
      }, index * 800); // 800ms delay between achievements
    });
  }, [unviewedAchievements, isInitialized, showAchievement]);
  
  return (
    <AchievementsContext.Provider value={{ 
      activeAchievements, 
      showAchievement, 
      hideAchievement,
      notificationsEnabled,
      setNotificationsEnabled
    }}>
      {children}
    </AchievementsContext.Provider>
  );
}

// Hook to use the achievements context
export function useAchievements() {
  const context = useContext(AchievementsContext);
  
  if (!context) {
    throw new Error('useAchievements must be used within an AchievementsProvider');
  }
  
  return context;
}