
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
  const touchMoveX = useRef<number>(0);
  const touchMoveY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchMoveX.current = touch.clientX;
    touchMoveY.current = touch.clientY;
    isDragging.current = false;
    console.log('Swipe: Touch start at', touch.clientX, touch.clientY);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchMoveX.current = touch.clientX;
    touchMoveY.current = touch.clientY;
    
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('Swipe: Touch move - deltaX:', deltaX, 'deltaY:', deltaY);
    
    // Start tracking if horizontal movement is greater than vertical and moving right
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      isDragging.current = true;
      console.log('Swipe: Started tracking horizontal movement');
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const finalDeltaX = touch.clientX - touchStartX.current;
    const finalDeltaY = Math.abs(touch.clientY - touchStartY.current);
    
    console.log('Swipe: Touch end - finalDeltaX:', finalDeltaX, 'finalDeltaY:', finalDeltaY, 'isDragging:', isDragging.current, 'threshold:', threshold, 'maxVerticalMovement:', maxVerticalMovement);
    
    // Always check for swipe, not just when isDragging
    // Check for right swipe (positive deltaX) with minimum distance and primarily horizontal movement
    if (finalDeltaX > threshold && finalDeltaY < maxVerticalMovement) {
      console.log('Swipe: Right swipe detected! Calling onSwipeRight');
      onSwipeRight();
    } else {
      console.log('Swipe: No valid swipe detected - deltaX:', finalDeltaX, '(needs >', threshold, '), deltaY:', finalDeltaY, '(needs <', maxVerticalMovement, ')');
    }
    
    isDragging.current = false;
  }, [onSwipeRight, threshold, maxVerticalMovement]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
