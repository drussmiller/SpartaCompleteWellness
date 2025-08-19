import { NotificationSettings } from '@/components/notification-settings';
import { AppLayout } from '@/components/app-layout';
import { BottomNav } from '@/components/bottom-nav';
import { useSwipeToClose } from '@/hooks/use-swipe-to-close';

export default function NotificationSettingsPage() {
  // Add swipe to close functionality
  useSwipeToClose({
    onClose: () => window.history.back(),
    enabled: true
  });

  return (
    <AppLayout>
      <NotificationSettings onClose={() => window.history.back()} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}