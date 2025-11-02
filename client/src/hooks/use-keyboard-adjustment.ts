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

    viewport.addEventListener('resize', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  return keyboardHeight;
}
