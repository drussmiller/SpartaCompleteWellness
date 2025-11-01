import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;
      
      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff);
        
        // Prevent page scroll when keyboard opens
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        });
      } else {
        setKeyboardHeight(0);
      }
    };

    // Call immediately to handle initial state
    handleResize();

    // Add multiple event listeners for better coverage
    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    
    // Also listen to window focus events (keyboard often triggers these)
    window.addEventListener('resize', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return keyboardHeight;
}
