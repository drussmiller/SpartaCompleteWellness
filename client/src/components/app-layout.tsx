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
