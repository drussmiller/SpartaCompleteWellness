

import { useCallback, useRef } from 'react';

interface UseSwipeToCloseOptions {
  onSwipeRight: () => void;
  threshold?: number;
  maxVerticalMovement?: number;
}

export function useSwipeToClose({ 
  onSwipeRight, 
  threshold = 60, 
  maxVerticalMovement = 150 
}: UseSwipeToCloseOptions) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwipeInProgress = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isSwipeInProgress.current = false;
    
    // Don't prevent default to allow normal scrolling
    console.log('🟦 SWIPE START at:', touch.clientX, touch.clientY, 'Target:', e.target);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwipeInProgress.current) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = Math.abs(touch.clientY - touchStartY.current);
      
      // Check if this looks like a horizontal swipe
      if (Math.abs(deltaX) > 15 && deltaY < 50) {
        isSwipeInProgress.current = true;
        console.log('🟩 HORIZONTAL SWIPE detected, deltaX:', deltaX, 'deltaY:', deltaY);
        
        // For right swipes, prevent default to avoid conflicts
        if (deltaX > 0) {
          console.log('🟩 Preventing default for right swipe');
          e.preventDefault();
        }
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('🟨 SWIPE END - deltaX:', deltaX, 'deltaY:', deltaY, 'threshold:', threshold, 'maxVertical:', maxVerticalMovement);
    
    // Check for right swipe: positive deltaX with minimum distance and not too much vertical movement
    if (deltaX > threshold && deltaY < maxVerticalMovement) {
      console.log('🟥 SWIPE RIGHT DETECTED! Executing close action');
      e.preventDefault();
      e.stopPropagation();
      
      // Execute immediately without delay
      onSwipeRight();
    } else {
      console.log('🟫 Swipe conditions not met - deltaX:', deltaX, '> threshold:', threshold, '?', deltaX > threshold, 'deltaY:', deltaY, '< maxVertical:', maxVerticalMovement, '?', deltaY < maxVerticalMovement);
    }
    
    isSwipeInProgress.current = false;
  }, [onSwipeRight, threshold, maxVerticalMovement]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
