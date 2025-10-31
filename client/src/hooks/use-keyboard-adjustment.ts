import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Use window resize instead of visualViewport for better iOS compatibility
    const initialHeight = window.innerHeight;
    let currentInputElement: HTMLElement | null = null;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        currentInputElement = target;
        // Wait for keyboard to appear
        setTimeout(() => {
          const newHeight = window.innerHeight;
          const heightDiff = initialHeight - newHeight;
          
          if (heightDiff > 100) {
            setKeyboardHeight(heightDiff);
          }
        }, 300);
      }
    };

    const handleFocusOut = () => {
      currentInputElement = null;
      // Wait for keyboard to dismiss
      setTimeout(() => {
        setKeyboardHeight(0);
      }, 100);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return keyboardHeight;
}
