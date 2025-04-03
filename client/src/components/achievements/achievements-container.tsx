import React from 'react';
import { AchievementBadge } from './achievement-badge';
import { useAchievements } from '@/hooks/use-achievements';
import { AnimatePresence } from 'framer-motion';

export function AchievementsContainer() {
  const { activeAchievements, hideAchievement } = useAchievements();

  if (activeAchievements.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {activeAchievements.map(achievement => (
          <AchievementBadge
            key={achievement.id}
            achievement={achievement}
            onComplete={() => hideAchievement(achievement.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}