import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpring, animated } from '@react-spring/web';
import { X } from 'lucide-react';
import { type ActiveAchievement } from '@/hooks/use-achievements';

interface AchievementBadgeProps {
  achievement: ActiveAchievement;
  onComplete: () => void;
}

export function AchievementBadge({ achievement, onComplete }: AchievementBadgeProps) {
  const [showSparkles, setShowSparkles] = useState(true);
  
  // Auto-hide after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 6000);
    
    return () => clearTimeout(timer);
  }, [onComplete]);
  
  // Use react-spring for the popping animation effect
  const springProps = useSpring({
    from: { scale: 0, opacity: 0, y: 20 },
    to: { scale: 1, opacity: 1, y: 0 },
    config: {
      tension: 300,
      friction: 15,
    },
  });
  
  // Determine position styles based on achievement.position
  const getPositionStyles = () => {
    switch (achievement.position) {
      case 'top-left':
        return { top: '20px', left: '20px' };
      case 'top-right':
        return { top: '20px', right: '20px' };
      case 'bottom-left':
        return { bottom: '20px', left: '20px' };
      case 'bottom-right':
        return { bottom: '20px', right: '20px' };
    }
  };
  
  // Hide sparkles after 3 seconds
  useEffect(() => {
    const sparkleTimer = setTimeout(() => {
      setShowSparkles(false);
    }, 3000);
    
    return () => clearTimeout(sparkleTimer);
  }, []);
  
  return (
    <AnimatePresence>
      <animated.div 
        style={{
          ...springProps,
          ...getPositionStyles(),
          position: 'absolute',
          maxWidth: '300px',
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
      >
        <motion.div
          className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <div className="relative p-4 flex items-start gap-4">
            {/* Close button */}
            <button 
              onClick={onComplete}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
            
            {/* Achievement icon */}
            <div className="relative flex-shrink-0">
              <img
                src={achievement.iconPath}
                alt={achievement.title}
                className="w-16 h-16 object-contain rounded-md"
                onError={(e) => {
                  // Fallback to default icon if the specific one fails to load
                  e.currentTarget.src = '/achievements/default.svg';
                }}
              />
              
              {/* Sparkles effect */}
              {showSparkles && (
                <div className="absolute -inset-2 pointer-events-none">
                  <Sparkles />
                </div>
              )}
            </div>
            
            {/* Achievement text */}
            <div className="flex-1 pt-1">
              <h3 className="font-bold text-lg text-primary">{achievement.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{achievement.description}</p>
            </div>
          </div>
        </motion.div>
      </animated.div>
    </AnimatePresence>
  );
}

// Sparkles component for the decoration effect
function Sparkles() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Top sparkle */}
      <motion.path
        d="M50 10 L53 20 L60 20 L55 25 L57 35 L50 30 L43 35 L45 25 L40 20 L47 20 Z"
        fill="#FFD700"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
        transition={{ delay: 0.2, duration: 0.8 }}
      />
      
      {/* Right sparkle */}
      <motion.path
        d="M80 50 L70 53 L70 60 L65 55 L55 57 L60 50 L55 43 L65 45 L70 40 L70 47 Z"
        fill="#FF6B6B"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
        transition={{ delay: 0.4, duration: 0.8 }}
      />
      
      {/* Bottom sparkle */}
      <motion.path
        d="M50 90 L47 80 L40 80 L45 75 L43 65 L50 70 L57 65 L55 75 L60 80 L53 80 Z"
        fill="#4CAF50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
        transition={{ delay: 0.6, duration: 0.8 }}
      />
      
      {/* Left sparkle */}
      <motion.path
        d="M20 50 L30 47 L30 40 L35 45 L45 43 L40 50 L45 57 L35 55 L30 60 L30 53 Z"
        fill="#2196F3"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 0.8] }}
        transition={{ delay: 0.8, duration: 0.8 }}
      />
    </svg>
  );
}