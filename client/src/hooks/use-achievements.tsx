import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Achievement types
export type AchievementType =
  | 'food-streak'
  | 'workout-streak'
  | 'scripture-streak'
  | 'memory-verse'
  | 'first-post'
  | 'week-complete'
  | 'team-milestone'
  | 'personal-milestone';

// Achievement object structure
export interface Achievement {
  id: string;
  type: AchievementType;
  title: string;
  description: string;
  iconPath: string;
  timestamp: number;
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
}

// Create the context
const AchievementsContext = createContext<AchievementsContextType>({
  activeAchievements: [],
  showAchievement: () => {},
  hideAchievement: () => {},
});

// Helper function to create an achievement
export function createAchievement(type: AchievementType): Achievement {
  // Title and description based on achievement type
  let title = '';
  let description = '';
  
  switch (type) {
    case 'food-streak':
      title = 'Food Streak Master';
      description = 'Completed 5 days of food logging in a row!';
      break;
    case 'workout-streak':
      title = 'Workout Warrior';
      description = 'Completed all your workouts for the week!';
      break;
    case 'scripture-streak':
      title = 'Scripture Scholar';
      description = 'Read scripture every day for a full week!';
      break;
    case 'memory-verse':
      title = 'Memory Master';
      description = 'Successfully memorized and shared a verse!';
      break;
    case 'first-post':
      title = 'First Post!';
      description = 'You made your first post on Sparta!';
      break;
    case 'week-complete':
      title = 'Perfect Week';
      description = 'You completed all activities for the entire week!';
      break;
    case 'team-milestone':
      title = 'Team Champion';
      description = 'Your team reached an important milestone!';
      break;
    case 'personal-milestone':
      title = 'Personal Best';
      description = 'You achieved a new personal milestone!';
      break;
  }
  
  // Get icon path or use default
  const iconPath = `/achievements/${type}.svg`;
  
  return {
    id: uuidv4(),
    type,
    title,
    description,
    iconPath,
    timestamp: Date.now(),
  };
}

// Provider component
export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [activeAchievements, setActiveAchievements] = useState<ActiveAchievement[]>([]);
  
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
  
  // Show an achievement
  const showAchievement = useCallback((achievement: Achievement) => {
    const activeAchievement: ActiveAchievement = {
      ...achievement,
      position: getNextPosition(),
    };
    
    setActiveAchievements(prev => [...prev, activeAchievement]);
    
    // Optional: Auto-hide after a delay (uncomment if desired)
    // setTimeout(() => {
    //   hideAchievement(achievement.id);
    // }, 6000);
  }, [getNextPosition]);
  
  // Hide an achievement
  const hideAchievement = useCallback((id: string) => {
    setActiveAchievements(prev => prev.filter(a => a.id !== id));
  }, []);
  
  return (
    <AchievementsContext.Provider value={{ activeAchievements, showAchievement, hideAchievement }}>
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