import { useEffect, useRef, RefObject } from 'react';

interface UseSwipeToCloseOptions {
  onSwipeRight: () => void;
  elementRef: RefObject<HTMLElement>;
  threshold?: number;
}

export function useSwipeToClose({ 
  onSwipeRight, 
  elementRef,
  threshold = 80
}: UseSwipeToCloseOptions) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const directionLocked = useRef<'horizontal' | 'vertical' | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      directionLocked.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (directionLocked.current) return;

      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX.current);
      const dy = Math.abs(touch.clientY - touchStartY.current);

      // Lock direction once movement exceeds threshold
      if (dx >= 16 || dy >= 16) {
        if (dx >= 1.5 * dy) {
          directionLocked.current = 'horizontal';
        } else {
          directionLocked.current = 'vertical';
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);

      // Check if this was a right swipe with primarily horizontal movement
      if (
        directionLocked.current === 'horizontal' &&
        dx > threshold &&
        dy <= 0.5 * Math.abs(dx)
      ) {
        onSwipeRight();
      }

      directionLocked.current = null;
    };

    // Add passive event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeRight, elementRef, threshold]);

  return {};
}
