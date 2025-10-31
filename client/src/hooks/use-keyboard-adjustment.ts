import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    console.log('[KEYBOARD] Hook mounted, checking for Visual Viewport API...');
    console.log('[KEYBOARD] window.visualViewport exists:', typeof window !== 'undefined' && !!window.visualViewport);
    
    if (typeof window === 'undefined' || !window.visualViewport) {
      console.log('[KEYBOARD] Visual Viewport API not available!');
      return;
    }

    console.log('[KEYBOARD] Visual Viewport API is available, setting up listeners');
    const viewport = window.visualViewport;

    const updateViewport = () => {
      // Correct calculation that accounts for viewport offset
      const inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      console.log('[KEYBOARD] VIEWPORT UPDATE - innerHeight:', window.innerHeight, 'viewport.height:', viewport.height, 'viewport.offsetTop:', viewport.offsetTop, 'calculated inset:', inset);
      setKeyboardInset(inset);
    };

    updateViewport();

    // Listen to both resize and scroll events
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    console.log('[KEYBOARD] Event listeners added');

    return () => {
      console.log('[KEYBOARD] Cleaning up event listeners');
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
    };
  }, []);

  console.log('[KEYBOARD] Current keyboardInset value:', keyboardInset);
  return keyboardInset;
}
