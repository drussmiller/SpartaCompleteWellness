import { useEffect, useState } from 'react';

export function useKeyboardAdjustmentMessages() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateKeyboardHeight = () => {
      if (window.visualViewport) {
        const layoutHeight = window.innerHeight;
        const visualHeight = window.visualViewport.height;
        const diff = layoutHeight - visualHeight;
        
        if (diff > 100) {
          setKeyboardHeight(diff);
        } else {
          setKeyboardHeight(0);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateKeyboardHeight);
      window.visualViewport.addEventListener('scroll', updateKeyboardHeight);
    }

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setTimeout(updateKeyboardHeight, 100);
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
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateKeyboardHeight);
        window.visualViewport.removeEventListener('scroll', updateKeyboardHeight);
      }
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return keyboardHeight;
}
