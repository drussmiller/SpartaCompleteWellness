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

export default function AppLayout({ children, title, sidebarWidth = "250" }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthPx = `${sidebarWidth}px`;

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
        {title && (
          <header className="sticky top-0 z-40 border-b border-border bg-background">
            <div className="container py-3">
              <h1 className="text-lg font-semibold">{title}</h1>
            </div>
          </header>
        )}
        {children}
        {isMobile && <BottomNav />}
      </div>
    </div>
  );
}