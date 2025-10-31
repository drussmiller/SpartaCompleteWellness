import { useEffect, useState } from 'react';

export function useKeyboardAdjustment() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    console.log('🎹 useKeyboardAdjustment hook initialized');
    
    if (typeof window === 'undefined' || !window.visualViewport) {
      console.log('⚠️ visualViewport not available');
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;
    console.log('🎹 Initial viewport height:', initialHeight);

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;
      console.log('🎹 Viewport resize detected - currentHeight:', currentHeight, 'heightDiff:', heightDiff);
      
      if (heightDiff > 150) {
        console.log('✅ Keyboard detected! Setting height to:', heightDiff);
        setKeyboardHeight(heightDiff);
        
        // Prevent page scroll when keyboard opens
        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        });
      } else {
        console.log('❌ Keyboard closed or small change');
        setKeyboardHeight(0);
      }
    };

    viewport.addEventListener('resize', handleResize);
    console.log('🎹 Resize listener added');

    return () => {
      console.log('🎹 Cleaning up keyboard adjustment hook');
      viewport.removeEventListener('resize', handleResize);
    };
  }, []);

  console.log('🎹 Current keyboardHeight:', keyboardHeight);
  return keyboardHeight;
}
