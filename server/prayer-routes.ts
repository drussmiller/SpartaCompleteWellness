import { Router } from "express";
import { db } from "./db";
import { users, posts } from "@shared/schema";
import { authenticate } from "./auth";
import { and, eq, gt, not } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export const prayerRoutes = Router();

// Get count of new prayer request posts since user's last view
prayerRoutes.get("/api/prayer-requests/unread", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Get the user's last prayer request view timestamp
    logger.info(`Fetching prayer request view timestamp for user ${req.user.id}`);
    const [user] = await db
      .select({ lastPrayerRequestView: users.lastPrayerRequestView })
      .from(users)
      .where(eq(users.id, req.user.id));

    // If user has never viewed prayer requests, count all prayer requests
    const lastViewTime = user?.lastPrayerRequestView || new Date(0); // Use epoch if null

    // Count prayer request posts since last view time
    const newPrayerRequests = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(posts)
      .where(
        and(
          eq(posts.type, 'prayer'),
          gt(posts.createdAt, lastViewTime),
          // Don't count user's own prayer requests as "new"
          not(eq(posts.userId, req.user.id))
        )
      );

    logger.info(`Unread prayer requests for user ${req.user.id}: ${newPrayerRequests[0].count}. Last viewed: ${lastViewTime}`);
    res.json({ unreadCount: newPrayerRequests[0].count });
  } catch (error) {
    logger.error('Error fetching unread prayer requests:', error);
    res.status(500).json({
      message: "Failed to fetch prayer request count",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Mark prayer requests as viewed (update last view timestamp)
prayerRoutes.post("/api/prayer-requests/mark-viewed", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Update user's last prayer request view timestamp
    await db
      .update(users)
      .set({ lastPrayerRequestView: new Date() })
      .where(eq(users.id, req.user.id));

    logger.info(`User ${req.user.id} marked prayer requests as viewed at ${new Date().toISOString()}`);
    res.json({ success: true, message: "Prayer requests marked as viewed" });
  } catch (error) {
    logger.error('Error marking prayer requests as viewed:', error);
    res.status(500).json({
      message: "Failed to mark prayer requests as viewed",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});