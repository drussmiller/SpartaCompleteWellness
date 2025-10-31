import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visualViewportHeight, setVisualViewportHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;
      
      // Update CSS custom properties with visual viewport dimensions
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport.height}`);
      document.documentElement.style.setProperty('--visual-viewport-offset-top', `${viewport.offsetTop}`);
      
      setVisualViewportHeight(viewport.height);
      
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

    // Initialize on mount
    handleResize();

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  return { keyboardHeight, visualViewportHeight };
}
