import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Hook to restore scroll position when returning from video player
 * This should be used on pages that have videos
 * @param scrollContainerRef - Optional ref to the scroll container element
 */
export function useRestoreScroll(scrollContainerRef?: React.RefObject<HTMLElement>) {
  const [location] = useLocation();

  useEffect(() => {
    // Check if we have a saved scroll position for this path
    const savedPath = sessionStorage.getItem('videoPlayerReturnPath');
    const savedScroll = sessionStorage.getItem('videoPlayerReturnScroll');

    if (savedPath === location && savedScroll) {
      const scrollY = parseInt(savedScroll, 10);
      console.log('Restoring scroll position:', scrollY, 'for path:', location);

      // Wait for DOM to be fully ready, then restore scroll
      // Use multiple animation frames to ensure all content has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            const container = scrollContainerRef?.current;
            if (container) {
              container.scrollTop = scrollY;
              console.log('Scroll restored to container:', scrollY, 'actual position:', container.scrollTop);
            } else {
              // Fallback to window scroll for pages not using scroll containers
              window.scrollTo({ top: scrollY, behavior: 'instant' });
              console.log('Scroll restored to window:', scrollY);
            }
          }, 50);
        });
      });

      // Clear the saved scroll position after restoring
      sessionStorage.removeItem('videoPlayerReturnScroll');
      sessionStorage.removeItem('videoPlayerReturnPath');
    }
  }, [location, scrollContainerRef]);
}
