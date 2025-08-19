
import { useEffect, useRef } from 'react';

interface UseSwipeToCloseOptions {
  onClose: () => void;
  enabled?: boolean;
}

export function useSwipeToClose({ onClose, enabled = true }: UseSwipeToCloseOptions) {
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      isDragging.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // Only start tracking if horizontal movement is dominant
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isDragging.current = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDragging.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // Check if it's a right swipe with sufficient distance and horizontal dominance
      if (
        deltaX > 100 && // Minimum swipe distance
        Math.abs(deltaY) < 100 && // Maximum vertical movement
        Math.abs(deltaX) > Math.abs(deltaY) * 2 // Horizontal movement should be at least 2x vertical
      ) {
        console.log('Swipe right detected, closing page');
        onClose();
      }

      isDragging.current = false;
    };

    // Add event listeners to document
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onClose, enabled]);
}
