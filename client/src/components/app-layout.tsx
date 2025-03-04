import { BottomNav } from "@/components/bottom-nav";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Side Navigation - Hidden on mobile */}
      <div className="hidden md:flex md:w-16 md:flex-col md:fixed md:inset-y-0 border-r border-border">
        <div className="flex-1 flex flex-col min-h-0 bg-background">
          <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-border">
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
          <nav className="flex-1 flex flex-col items-center py-4 space-y-4">
            <BottomNav orientation="vertical" />
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-16">
        {children}
      </div>

      {/* Bottom Navigation - Only visible on mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <BottomNav />
      </div>
    </div>
  );
}
import React from "react";
import { BottomNav } from "@/components/bottom-nav";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className="flex min-h-screen bg-background">
      {/* Left sidebar - only visible on non-mobile devices */}
      {!isMobile && (
        <div className="fixed left-0 top-0 h-full w-16 bg-sidebar z-40 border-r border-border">
          {/* Sidebar content */}
          <div className="flex flex-col h-full py-4">
            {/* You can add sidebar items here */}
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
