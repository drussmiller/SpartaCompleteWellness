
import { NotificationSchedule } from '@/components/notification-schedule';
import { AppLayout } from '@/components/app-layout';

import { BottomNav } from '@/components/bottom-nav';

export default function NotificationSchedulePage() {
  return (
    <AppLayout>
      <NotificationSchedule onClose={() => window.history.back()} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}
