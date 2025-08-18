
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
  const isDragging = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartX.current);
      const deltaY = Math.abs(touch.clientY - touchStartY.current);
      
      // Start tracking if horizontal movement is greater than vertical
      if (deltaX > deltaY && deltaX > 10) {
        isDragging.current = true;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);
    
    // Check for right swipe (positive deltaX) with minimum distance and primarily horizontal movement
    if (deltaX > threshold && deltaY < maxVerticalMovement) {
      onSwipeRight();
    }
    
    isDragging.current = false;
  }, [onSwipeRight, threshold, maxVerticalMovement]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
