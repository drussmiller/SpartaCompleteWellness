import React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  useAchievements, 
  createAchievement, 
  type AchievementType 
} from '@/hooks/use-achievements';

export function AchievementDemo() {
  const { 
    showAchievement, 
    notificationsEnabled, 
    setNotificationsEnabled
  } = useAchievements();

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
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Achievement Demo</h3>
        <div className="flex items-center gap-2">
          <Switch 
            id="achievement-notifications"
            checked={notificationsEnabled}
            onCheckedChange={setNotificationsEnabled}
          />
          <Label htmlFor="achievement-notifications">
            {notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
          </Label>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {notificationsEnabled 
          ? 'Click a button to show an achievement badge' 
          : 'Achievements are hidden. Toggle the switch to enable notifications.'}
      </p>
      
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