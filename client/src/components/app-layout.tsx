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

export function AppLayout({ children, title, sidebarWidth = "250" }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex h-full">
      {!isMobile && (
        <aside className="fixed inset-y-0 left-0 z-20 flex-shrink-0 border-r border-border bg-sidebar" style={{ width: `${sidebarWidth}px` }}>
          <VerticalNav />
        </aside>
      )}
      <div className={cn(
        "flex flex-col min-h-screen w-full",
        !isMobile && `ml-[${sidebarWidth}px]`
      )}>
        {title && (
          <header className="sticky top-0 z-40 border-b border-border bg-background">
            <div className="py-3 px-4">
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
          </header>
        )}
        <div className="flex-1 w-full">
          {children}
        </div>
        {isMobile && <BottomNav />}
      </div>
    </div>
  );
}