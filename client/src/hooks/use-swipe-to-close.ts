

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    console.log('🟢 Swipe: Touch start at', touch.clientX, touch.clientY);
    // Don't prevent default to allow normal scrolling
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Allow normal scrolling
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('🔵 Swipe: Touch end - deltaX:', deltaX, 'deltaY:', deltaY, 'threshold:', threshold, 'maxVertical:', maxVerticalMovement);
    
    // Check for right swipe: positive deltaX with minimum distance and not too much vertical movement
    if (deltaX > threshold && deltaY < maxVerticalMovement) {
      console.log('✅ Swipe: Right swipe detected! Preventing default and triggering navigation');
      e.preventDefault();
      e.stopPropagation();
      
      // Add a small delay to ensure the touch event is fully processed
      setTimeout(() => {
        onSwipeRight();
      }, 50);
    } else {
      console.log('❌ Swipe: No valid swipe - deltaX needs >', threshold, 'got', deltaX, '| deltaY needs <', maxVerticalMovement, 'got', deltaY);
    }
  }, [onSwipeRight, threshold, maxVerticalMovement]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
