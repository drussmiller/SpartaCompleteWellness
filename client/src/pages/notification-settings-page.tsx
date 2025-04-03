import { NotificationSettings } from '@/components/notification-settings';
import { AppLayout } from '@/components/app-layout';
import { BottomNav } from '@/components/bottom-nav';

export default function NotificationSettingsPage() {
  return (
    <AppLayout>
      <NotificationSettings onClose={() => window.history.back()} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}