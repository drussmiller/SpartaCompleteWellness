import { useEffect, useState } from 'react';

export function useKeyboardAdjustmentMessages() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    // Capture baseline height before keyboard appears
    const baseInnerHeight = window.innerHeight;

    const updateKeyboardHeight = () => {
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        // Calculate keyboard height: baseHeight - (viewport height + top offset)
        const calculatedHeight = baseInnerHeight - (viewport.height + viewport.offsetTop);
        
        console.log('🎹 Keyboard detection:', {
          baseInnerHeight,
          viewportHeight: viewport.height,
          viewportOffsetTop: viewport.offsetTop,
          calculatedHeight,
          willSetKeyboard: calculatedHeight > 50
        });
        
        if (calculatedHeight > 50) {
          setKeyboardHeight(calculatedHeight);
        } else {
          setKeyboardHeight(0);
        }
      }
    };

    // Use geometrychange event instead of resize/scroll
    window.visualViewport.addEventListener('geometrychange', updateKeyboardHeight);

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        console.log('📝 Input focused, checking keyboard...');
        setTimeout(updateKeyboardHeight, 300);
      }
    };

    const handleFocusOut = () => {
      console.log('📝 Input blurred, hiding keyboard...');
      setTimeout(() => {
        setKeyboardHeight(0);
      }, 100);
    };

    // Attach to document, not window (focus events bubble to document)
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('geometrychange', updateKeyboardHeight);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return keyboardHeight;
}
