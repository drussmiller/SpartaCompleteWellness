
import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;
    let focusedElement: Element | null = null;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;
      
      // Only set keyboard height if an input is focused
      if (focusedElement && heightDiff > 150) {
        setKeyboardHeight(heightDiff);
        
        // Prevent page scroll when keyboard opens
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        });
      } else if (!focusedElement) {
        setKeyboardHeight(0);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        focusedElement = target;
        
        // Wait for keyboard to appear
        setTimeout(() => {
          handleResize();
        }, 300);
      }
    };

    const handleFocusOut = () => {
      focusedElement = null;
      
      // Wait for keyboard to disappear
      setTimeout(() => {
        setKeyboardHeight(0);
      }, 100);
    };

    viewport.addEventListener('resize', handleResize);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return keyboardHeight;
}
