import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const updateViewport = () => {
      // Correct calculation that accounts for viewport offset
      const inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      console.log('[KEYBOARD] innerHeight:', window.innerHeight, 'viewport.height:', viewport.height, 'viewport.offsetTop:', viewport.offsetTop, 'calculated inset:', inset);
      setKeyboardInset(inset);
    };

    updateViewport();

    // Listen to both resize and scroll events
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);

    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, []);

  return keyboardInset;
}
