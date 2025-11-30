import { useEffect, useState, useRef } from 'react';

interface ScrollDirectionOptions {
  scrollContainerRef: React.RefObject<HTMLElement>;
  threshold?: number;
  velocityThreshold?: number;
}

interface ScrollDirectionResult {
  isHeaderVisible: boolean;
  isBottomNavVisible: boolean;
  scrollY: number;
}

export function useScrollDirection({
  scrollContainerRef,
  threshold = 50,
  velocityThreshold = 1.5
}: ScrollDirectionOptions): ScrollDirectionResult {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    let rafId: number;
    let scrollVelocity = 0;

    const handleScroll = () => {
      rafId = requestAnimationFrame(() => {
        const currentScrollY = scrollContainer.scrollTop;
        const currentTime = Date.now();
        const timeDelta = currentTime - lastScrollTime.current;

        // Calculate scroll velocity (pixels per millisecond)
        if (timeDelta > 0) {
          scrollVelocity = Math.abs(currentScrollY - lastScrollY.current) / timeDelta;
        }

        setScrollY(currentScrollY);

        // Hide panels when scrolling down past threshold
        if (currentScrollY > lastScrollY.current && currentScrollY > threshold) {
          setIsHeaderVisible(false);
          setIsBottomNavVisible(false);
        }
        // Show panels when at top OR when scrolling up fast from anywhere
        else if (
          currentScrollY <= threshold ||
          (currentScrollY < lastScrollY.current && scrollVelocity > velocityThreshold)
        ) {
          setIsHeaderVisible(true);
          setIsBottomNavVisible(true);
        }

        lastScrollY.current = currentScrollY;
        lastScrollTime.current = currentTime;
      });
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [scrollContainerRef, threshold, velocityThreshold]);

  return { isHeaderVisible, isBottomNavVisible, scrollY };
}
