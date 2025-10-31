import { useEffect, useState } from 'react';

interface KeyboardState {
  viewportHeight: number;
  keyboardInset: number;
}

export function useKeyboardAdjustment() {
  const [state, setState] = useState<KeyboardState>({
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    keyboardInset: 0
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const updateViewport = () => {
      const viewportHeight = viewport.height;
      const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      
      setState({ viewportHeight, keyboardInset });
      
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewportHeight}px`);
      document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
    };

    updateViewport();

    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);

    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
      document.documentElement.style.removeProperty('--visual-viewport-height');
      document.documentElement.style.removeProperty('--keyboard-inset');
    };
  }, []);

  return state;
}
