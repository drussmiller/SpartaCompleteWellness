import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;

    const updateViewport = () => {
      // Calculate how much smaller the viewport has become
      const currentHeight = viewport.height;
      const heightDiff = Math.max(0, initialHeight - currentHeight);
      
      setKeyboardHeight(heightDiff);
    };

    updateViewport();

    viewport.addEventListener('resize', updateViewport);

    return () => {
      viewport.removeEventListener('resize', updateViewport);
    };
  }, []);

  return keyboardHeight;
}
