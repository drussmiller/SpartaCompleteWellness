import { BottomNav } from "@/components/bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left sidebar - only visible on non-mobile devices */}
      {!isMobile && (
        <div className="fixed left-0 top-0 h-full w-16 bg-sidebar z-40 border-r border-border">
          {/* Sidebar content */}
          <div className="flex flex-col h-full py-4">
            {title && (
              <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-border">
                <h1 className="text-xl font-bold">{title}</h1>
              </div>
            )}
            <nav className="flex-1 flex flex-col items-center py-4 space-y-4">
              <BottomNav orientation="vertical" />
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 ${!isMobile ? "ml-16" : ""}`}>
        {children}
      </main>

      {/* Bottom navigation - always present but styled differently on desktop */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 ${!isMobile ? "left-16" : ""}`}>
        <BottomNav />
      </div>
    </div>
  );
}