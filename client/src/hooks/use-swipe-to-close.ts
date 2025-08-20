

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
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    // Check if this looks like a horizontal swipe (right direction)
    if (deltaX > 20 && deltaY < 80) {
      if (!isSwipeInProgress.current) {
        isSwipeInProgress.current = true;
        console.log('🟩 RIGHT SWIPE IN PROGRESS detected, deltaX:', deltaX, 'deltaY:', deltaY);
      }
      
      // Always prevent default for right swipes to avoid interference
      console.log('🟩 Preventing default for right swipe movement');
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('🟨 TOUCH MOVE - deltaX:', deltaX, 'deltaY:', deltaY, 'swipeInProgress:', isSwipeInProgress.current);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('🟨 SWIPE END - deltaX:', deltaX, 'deltaY:', deltaY, 'threshold:', threshold, 'maxVertical:', maxVerticalMovement, 'swipeInProgress:', isSwipeInProgress.current);
    
    // Check for right swipe: positive deltaX with minimum distance and not too much vertical movement
    if (deltaX > threshold && deltaY < maxVerticalMovement) {
      console.log('🟥 SWIPE RIGHT DETECTED! Executing close action');
      e.preventDefault();
      e.stopPropagation();
      
      // Execute immediately without delay
      requestAnimationFrame(() => {
        onSwipeRight();
      });
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
