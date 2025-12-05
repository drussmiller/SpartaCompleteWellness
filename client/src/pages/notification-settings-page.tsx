import { NotificationSettings } from '@/components/notification-settings';
import { AppLayout } from '@/components/app-layout';
import { BottomNav } from '@/components/bottom-nav';
import { useMemo } from 'react';

export default function NotificationSettingsPage() {
  // Detect Android device for bottom padding adjustment
  const isAndroid = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('android') > -1;
  }, []);
  
  return (
    <AppLayout>
      <div className={isAndroid ? 'pb-40' : ''}>
        <NotificationSettings onClose={() => window.history.back()} />
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}