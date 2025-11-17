import { createContext, useContext } from 'react';

interface ScrollContainerContextType {
  scrollContainerRef: React.RefObject<HTMLDivElement> | null;
}

export const ScrollContainerContext = createContext<ScrollContainerContextType>({
  scrollContainerRef: null
});

export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}
