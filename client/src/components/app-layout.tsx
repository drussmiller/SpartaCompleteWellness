import { BottomNav } from "@/components/bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  sidebarWidth?: string;
}

export function AppLayout({ children, title, sidebarWidth = "16" }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const sidebarWidthPx = `${sidebarWidth}px`;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left sidebar - only visible on non-mobile devices */}
      {!isMobile && (
        <div 
          className="fixed left-0 top-0 h-full bg-background z-40 border-r border-border"
          style={{ width: sidebarWidthPx }}
        >
          <BottomNav orientation="vertical" />
        </div>
      )}

      {/* Main content */}
      <main 
        className="flex-1 w-full"
        style={!isMobile ? { marginLeft: sidebarWidthPx } : {}}
      >
        {children}
      </main>

      {/* Bottom navigation - only on mobile */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
