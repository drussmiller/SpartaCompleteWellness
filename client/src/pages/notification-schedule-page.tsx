
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { NotificationSettings } from '@/components/notification-settings';
import { AppLayout } from '@/components/app-layout';
import { BottomNav } from '@/components/bottom-nav';

// This component redirects to notification-settings for backward compatibility
export default function NotificationSchedulePage() {
  const [, setLocation] = useLocation();
  
  // Optional: Uncomment to redirect to the new URL
  // useEffect(() => {
  //   setLocation('/notification-settings', { replace: true });
  // }, [setLocation]);
  
  return (
    <AppLayout>
      <NotificationSettings onClose={() => window.history.back()} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}
