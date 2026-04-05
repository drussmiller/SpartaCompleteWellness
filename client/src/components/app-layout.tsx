import React, { useRef } from "react";
import { VerticalNav } from "./vertical-nav";
import { BottomNav } from "./bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ScrollContainerContext } from "@/contexts/scroll-container-context";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  headerContent?: React.ReactNode;
  sidebarWidth?: string;
  isBottomNavVisible?: boolean;
  scrollOffset?: number;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export function AppLayout({ 
  children, 
  title, 
  headerContent,
  sidebarWidth = "320", 
  isBottomNavVisible = true, 
  scrollOffset = 0,
  scrollContainerRef 
}: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthPx = `${sidebarWidth}px`;
  
  // Create internal ref if none provided
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollContainerRef || internalRef;

  return (
    <ScrollContainerContext.Provider value={{ scrollContainerRef: containerRef }}>
      <div className="flex h-full" style={{ touchAction: 'pan-y pinch-zoom' }}>
        <div className={cn("flex flex-col flex-1 h-screen overflow-hidden")}>
          {headerContent && (
            <header className="flex-shrink-0 z-50 border-b border-border bg-background">
              {headerContent}
            </header>
          )}
          {title && !headerContent && (
            <header className="flex-shrink-0 z-50 border-b border-border bg-background">
              <div className={`${!isMobile ? 'max-w-[1000px] mx-auto px-6' : 'container'} py-3`}>
                <h1 className="text-lg font-semibold">{title}</h1>
              </div>
            </header>
          )}
          <div 
            ref={containerRef}
            className="flex-1 overflow-y-auto scroll-container"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'auto',
              touchAction: 'pan-y pinch-zoom'
            }}
          >
            <main className={`${isMobile ? 'pt-20' : ''}`} style={{ touchAction: 'pan-y pinch-zoom' }}>
              {children}
            </main>
          </div>
          
          {/* Portal root for overlays that need to respect layout constraints */}
          <div id="app-portal-root" className="pointer-events-none fixed inset-x-0 top-16 bottom-0 flex justify-center">
            <div className="w-full max-w-[1000px]"></div>
          </div>
          
          {isMobile && <BottomNav orientation="horizontal" isVisible={isBottomNavVisible} scrollOffset={scrollOffset} />}
        </div>
      </div>
    </ScrollContainerContext.Provider>
  );
}