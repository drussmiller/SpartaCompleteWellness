
import React from "react";
import { BottomNav } from "@/components/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

export function AlertPage() {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left sidebar - only visible on non-mobile devices */}
      {!isMobile && (
        <div className="fixed left-0 top-0 h-full w-16 bg-background z-40 border-r border-border">
          <BottomNav orientation="vertical" />
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 ${!isMobile ? "ml-16" : ""} pt-4`}>
        <div className="container p-4 md:ml-8">
          <header className="mb-6 pt-4 md:pt-8">
            <h1 className="text-2xl font-bold">Alerts</h1>
          </header>
          
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-2">Alert Content</h2>
                <p>Alert information will appear here</p>
              </CardContent>
            </Card>
          </div>
        </div>
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

export default AlertPage;
