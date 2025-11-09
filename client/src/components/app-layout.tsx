import React from "react";
import { VerticalNav } from "./vertical-nav";
import { BottomNav } from "./bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  sidebarWidth?: string;
  isBottomNavVisible?: boolean;
  scrollOffset?: number;
}

export function AppLayout({ children, title, sidebarWidth = "320", isBottomNavVisible = true, scrollOffset = 0 }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthPx = `${sidebarWidth}px`;

  // Debug logging
  console.log('AppLayout render - isBottomNavVisible:', isBottomNavVisible, 'isMobile:', isMobile);

  return (
    <div className="flex h-full" style={{ touchAction: 'pan-y pinch-zoom' }}>
      <div className={cn(
        "flex flex-col flex-1 min-h-screen"
      )}>
        {title && (
          <header className="flex-shrink-0 sticky top-0 z-50 border-b border-border bg-white">
            <div className={`${!isMobile ? 'max-w-[1000px] mx-auto px-6' : 'container'} py-4`}>
              <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            </div>
          </header>
        )}
        <main className="flex-1 min-h-0" style={{ touchAction: 'pan-y pinch-zoom' }}>
          {children}
        </main>
        {isMobile && <BottomNav orientation="horizontal" isVisible={isBottomNavVisible} scrollOffset={scrollOffset} />}
      </div>
    </div>
  );
}