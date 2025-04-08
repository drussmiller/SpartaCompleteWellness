
import { useLocation } from 'wouter';
import { NotificationScheduler } from '@/components/notification-scheduler';
import { AppLayout } from '@/components/app-layout';
import { BottomNav } from '@/components/bottom-nav';

export default function NotificationSchedulePage() {
  const [, setLocation] = useLocation();
  
  return (
    <AppLayout>
      <NotificationScheduler onClose={() => window.history.back()} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </AppLayout>
  );
}
