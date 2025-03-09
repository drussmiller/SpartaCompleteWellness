
import { VerticalNav } from "@/components/vertical-nav";
import { BottomNav } from "@/components/bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  sidebarWidth?: number;
}

export function AppLayout({ children, title, sidebarWidth = 16 }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthRem = `${sidebarWidth}rem`;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Vertical navigation for larger screens */}
      {!isMobile && (
        <div
          className="fixed left-0 top-0 h-full bg-background z-50 border-r border-border"
          style={{ width: sidebarWidthRem }}
        >
          <VerticalNav />
        </div>
      )}

      {/* Main content area */}
      <div 
        className="flex-1 flex flex-col"
        style={{ 
          marginLeft: !isMobile ? sidebarWidthRem : '0'
        }}
      >
        {title && (
          <header className="sticky top-0 z-40 border-b border-border bg-background">
            <div className="container py-3">
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
          </header>
        )}
        <main className="flex-1">
          {children}
        </main>
      </div>

      {/* Bottom navigation for mobile */}
      {isMobile && (
        <div className="sticky bottom-0 border-t border-border bg-background z-50">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
import React from "react";
import { VerticalNav } from "./vertical-nav";
import { BottomNav } from "./bottom-nav";
import { useMobile } from "../hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarWidth?: string;
}

export function AppLayout({ children, sidebarWidth = "250" }: AppLayoutProps) {
  const isMobile = useMobile();

  return (
    <div className="flex h-full">
      {!isMobile && (
        <aside className={`w-[${sidebarWidth}px] fixed inset-y-0 z-20 flex-shrink-0 border-r border-border bg-sidebar`}>
          <VerticalNav />
        </aside>
      )}
      <div className={cn(
        "flex flex-col flex-1 min-h-screen",
        !isMobile ? `ml-[${sidebarWidth}px]` : ""
      )}>
        {children}
        {isMobile && <BottomNav />}
      </div>
    </div>
  );
}
