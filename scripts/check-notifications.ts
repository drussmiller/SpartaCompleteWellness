#!/usr/bin/env tsx

import { checkNotifications } from "../server/notification-check";

async function main() {
  console.log("[SCHEDULER] Starting standalone notification check...");
  
  const result = await checkNotifications();
  
  console.log("[SCHEDULER] Check completed:");
  console.log(`  - Users checked: ${result.usersChecked}`);
  console.log(`  - Notifications created: ${result.notificationsCreated}`);
  console.log(`  - SMS sent: ${result.smsNotificationsSent}`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("[SCHEDULER] Fatal error:", error);
  process.exit(1);
});
