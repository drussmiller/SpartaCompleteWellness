
import { useCallback, useRef } from 'react';

interface UseSwipeToCloseOptions {
  onSwipeRight: () => void;
  threshold?: number;
  maxVerticalMovement?: number;
}

export function useSwipeToClose({ 
  onSwipeRight, 
  threshold = 100, 
  maxVerticalMovement = 100 
}: UseSwipeToCloseOptions) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    console.log('Swipe: Touch start at', touch.clientX, touch.clientY);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // We don't need to do much here, just let the move happen
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    console.log('Swipe: Touch move - deltaX:', deltaX, 'deltaY:', deltaY);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('Swipe: Touch end - deltaX:', deltaX, 'deltaY:', deltaY, 'threshold:', threshold, 'maxVerticalMovement:', maxVerticalMovement);
    
    // Check for right swipe: positive deltaX with minimum distance and not too much vertical movement
    if (deltaX > threshold && deltaY < maxVerticalMovement) {
      console.log('Swipe: Right swipe detected! Calling onSwipeRight');
      onSwipeRight();
    } else {
      console.log('Swipe: No valid swipe - deltaX:', deltaX, '(needs >', threshold, '), deltaY:', deltaY, '(needs <', maxVerticalMovement, ')');
    }
  }, [onSwipeRight, threshold, maxVerticalMovement]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
