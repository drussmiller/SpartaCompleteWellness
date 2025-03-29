
import { NotificationSchedule } from '@/components/notification-schedule';
import { AppLayout } from '@/components/app-layout';

export default function NotificationSchedulePage() {
  return (
    <AppLayout>
      <NotificationSchedule onClose={() => window.history.back()} />
    </AppLayout>
  );
}
