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

    // Listen to multiple events for better compatibility
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    
    // Add focus listener on document to catch keyboard events
    const handleFocus = () => {
      console.log('[KEYBOARD] Input focused, checking viewport...');
      setTimeout(updateViewport, 300);
    };
    document.addEventListener('focusin', handleFocus);
    
    console.log('[KEYBOARD] Event listeners added (viewport resize/scroll + window resize + focusin)');

    return () => {
      console.log('[KEYBOARD] Cleaning up event listeners');
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      document.removeEventListener('focusin', handleFocus);
    };
  }, []);

  console.log('[KEYBOARD] Current keyboardInset value:', keyboardInset);
  return keyboardInset;
}
