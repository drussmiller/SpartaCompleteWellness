import React from "react";
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

  return (
    <div className="flex h-full">
      <div className={cn(
        "flex flex-col flex-1 min-h-screen"
      )}>
        {title && (
          <header className="sticky top-0 z-50 border-b border-border bg-background md:pl-20">
            <div className="container py-3">
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
          </header>
        )}
        <div className="flex-1 md:pl-20">
          {children}
        </div>
        {isMobile && <BottomNav />}
      </div>
    </div>
  );
}