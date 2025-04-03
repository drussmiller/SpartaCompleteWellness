import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  useAchievements, 
  createAchievement, 
  type AchievementType 
} from '@/hooks/use-achievements';

export function AchievementDemo() {
  const { showAchievement } = useAchievements();

  const achievementTypes: AchievementType[] = [
    'food-streak-3',
    'food-streak-7',
    'workout-streak-3',
    'workout-streak-7',
    'scripture-streak-3',
    'scripture-streak-7',
    'memory-verse-streak-4',
    'first-post',
    'week-complete',
    'team-milestone',
    'personal-milestone'
  ];

  const handleShowAchievement = (type: AchievementType) => {
    const achievement = createAchievement(type);
    showAchievement(achievement);
  };

  return (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
      <h3 className="font-semibold">Achievement Demo</h3>
      <p className="text-sm text-muted-foreground">Click a button to show an achievement badge</p>
      
      <div className="grid grid-cols-2 gap-2">
        {achievementTypes.map(type => (
          <Button 
            key={type}
            variant="outline"
            size="sm"
            onClick={() => handleShowAchievement(type)}
          >
            {type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
          </Button>
        ))}
      </div>
    </div>
  );
}