
import React from "react";
import { useLocation } from "@/hooks/use-location";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import BottomNav from "@/components/bottom-nav";

type LayoutProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Layout({ children, className }: LayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className={cn("flex-1", className)}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
