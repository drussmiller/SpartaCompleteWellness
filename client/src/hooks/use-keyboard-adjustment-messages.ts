import { useEffect, useState } from 'react';

export function useKeyboardAdjustmentMessages() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const initialHeight = window.innerHeight;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
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
