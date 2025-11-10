import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;
    let debounceTimer: NodeJS.Timeout | null = null;

    const updateKeyboardHeight = () => {
      // Clear any existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Add a small delay to ensure keyboard is fully opened/closed
      debounceTimer = setTimeout(() => {
        const currentHeight = viewport.height;
        const heightDiff = initialHeight - currentHeight;
        
        // Only set keyboard height if difference is significant (keyboard is open)
        if (heightDiff > 150) {
          setKeyboardHeight(heightDiff);
        } else {
          setKeyboardHeight(0);
        }
      }, 100); // 100ms delay to ensure keyboard animation completes
    };

    // Add multiple event listeners for faster detection
    viewport.addEventListener('resize', updateKeyboardHeight);
    viewport.addEventListener('scroll', updateKeyboardHeight);
    
    // geometrychange event fires earlier than resize on some browsers
    if ('ongeometrychange' in viewport) {
      viewport.addEventListener('geometrychange', updateKeyboardHeight);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateKeyboardHeight);

    // Run initial check
    updateKeyboardHeight();

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      viewport.removeEventListener('resize', updateKeyboardHeight);
      viewport.removeEventListener('scroll', updateKeyboardHeight);
      if ('ongeometrychange' in viewport) {
        viewport.removeEventListener('geometrychange', updateKeyboardHeight);
      }
      window.removeEventListener('resize', updateKeyboardHeight);
    };
  }, []);

  return keyboardHeight;
}
