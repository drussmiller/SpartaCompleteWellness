import { useEffect, useState } from 'react';

export function useKeyboardAdjustmentMessages() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    console.log('⚡ useKeyboardAdjustmentMessages hook initialized');
    
    if (typeof window === 'undefined') {
      console.log('⚠️ Window is undefined');
      return;
    }
    
    if (!window.visualViewport) {
      console.log('⚠️ visualViewport not supported');
      return;
    }

    console.log('✅ visualViewport supported, setting up listeners');
    
    // Capture baseline height before keyboard appears
    const baseInnerHeight = window.innerHeight;
    console.log('📏 Baseline height:', baseInnerHeight);

    const updateKeyboardHeight = () => {
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        // Calculate keyboard height: baseHeight - (viewport height + top offset)
        const calculatedHeight = baseInnerHeight - (viewport.height + viewport.offsetTop);
        
        console.log('🎹 Keyboard detection (geometrychange):', {
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

    // Use geometrychange event - this fires whenever viewport size changes (including keyboard)
    window.visualViewport.addEventListener('geometrychange', updateKeyboardHeight);
    
    console.log('🎯 Listeners attached - waiting for keyboard to appear');

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('geometrychange', updateKeyboardHeight);
      }
    };
  }, []);

  return keyboardHeight;
}
