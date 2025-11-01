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
        
        console.log('🎹 Keyboard check:', {
          base: baseInnerHeight,
          vpHeight: viewport.height,
          vpTop: viewport.offsetTop,
          calc: calculatedHeight
        });
        
        if (calculatedHeight > 50) {
          setKeyboardHeight(calculatedHeight);
        } else {
          setKeyboardHeight(0);
        }
      }
    };

    // Use geometrychange event
    window.visualViewport.addEventListener('geometrychange', updateKeyboardHeight);
    window.visualViewport.addEventListener('resize', updateKeyboardHeight);
    window.visualViewport.addEventListener('scroll', updateKeyboardHeight);
    
    // Poll every 200ms as fallback for iOS Safari
    const pollInterval = setInterval(updateKeyboardHeight, 200);
    
    console.log('🎯 Listeners + polling active');

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('geometrychange', updateKeyboardHeight);
        window.visualViewport.removeEventListener('resize', updateKeyboardHeight);
        window.visualViewport.removeEventListener('scroll', updateKeyboardHeight);
      }
      clearInterval(pollInterval);
    };
  }, []);

  return keyboardHeight;
}
