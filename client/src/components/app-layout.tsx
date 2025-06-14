import React, { useState, useEffect } from "react";
import { VerticalNav } from "./vertical-nav";
import { BottomNav } from "./bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  sidebarWidth?: string;
}

export function AppLayout({ children, title, sidebarWidth = "320" }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthPx = `${sidebarWidth}px`;
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);

  useEffect(() => {
    let lastScrollY = window.pageYOffset;

    const handleScroll = () => {
      const currentScrollY = window.pageYOffset;
      const scrollDelta = Math.abs(currentScrollY - lastScrollY);
      
      // Only trigger if scroll delta is significant (prevents minor scrolls from triggering)
      if (scrollDelta > 5) {
        const scrollingDown = currentScrollY > lastScrollY;
        
        setIsHeaderVisible(!scrollingDown || currentScrollY === 0);
        setIsBottomNavVisible(!scrollingDown || currentScrollY === 0);
        
        lastScrollY = currentScrollY > 0 ? currentScrollY : 0;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div className="flex h-full">
      <div className={cn("flex flex-col flex-1 min-h-screen")}>
        {title && (
          <header className={cn("sticky top-0 z-50 border-b border-border bg-background md:pl-20", {
            'transform translate-y-0 duration-300': isHeaderVisible,
            'transform -translate-y-full duration-300': !isHeaderVisible,
          })}>
            <div className="container py-3">
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
          </header>
        )}
        <div className={`flex-1 md:pl-20 ${isMobile ? 'pt-20' : ''}`}>
          {children}
        </div>
        {isMobile && <BottomNav isVisible={isBottomNavVisible} />}
      </div>
    </div>
  );
}