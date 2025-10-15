import { Router } from "express";
import { db } from "./db";
import { users, posts, groups, organizations, teams } from "@shared/schema";
import { authenticate } from "./auth";
import { and, eq, gt, not, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export const prayerRoutes = Router();

// Get count of new prayer request posts since user's last view
prayerRoutes.get("/api/prayer-requests/unread", authenticate, async (req, res) => {
  // Set JSON content type at the very beginning
  res.setHeader('Content-Type', 'application/json');
  
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get the user's last prayer request view timestamp and team info
    logger.info(`Fetching prayer request view timestamp for user ${req.user.id}`);
    const [user] = await db
      .select({ 
        lastPrayerRequestView: users.lastPrayerRequestView,
        teamId: users.teamId
      })
      .from(users)
      .where(eq(users.id, req.user.id));

    // If user has never viewed prayer requests, count all prayer requests
    const lastViewTime = user?.lastPrayerRequestView || new Date(0); // Use epoch if null

    // If user is not in a team, return 0 (no organization context)
    if (!user?.teamId) {
      logger.info(`User ${req.user.id} is not in a team, returning 0 prayer requests`);
      res.json({ unreadCount: 0 });
      return;
    }

    // Find the group for the user's team (team -> group)
    const [userTeamData] = await db
      .select({ 
        groupId: teams.groupId
      })
      .from(teams)
      .where(eq(teams.id, user.teamId));

    if (!userTeamData?.groupId) {
      logger.info(`User ${req.user.id}'s team has no group, returning 0 prayer requests`);
      res.json({ unreadCount: 0 });
      return;
    }

    // Find all teams in the same group
    const groupTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.groupId, userTeamData.groupId));

    const teamIds = groupTeams.map(t => t.id);

    // Find all users in those teams
    const groupUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.teamId, teamIds));

    const userIds = groupUsers.map(u => u.id);

    // Count prayer request posts since last view time from users in the same group
    const newPrayerRequests = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(posts)
      .where(
        and(
          eq(posts.type, 'prayer'),
          gt(posts.createdAt, lastViewTime),
          // Only count prayer requests from users in the same group
          inArray(posts.userId, userIds),
          // Don't count user's own prayer requests as "new"
          not(eq(posts.userId, req.user.id))
        )
      );

    logger.info(`Unread prayer requests for user ${req.user.id} (group ${userTeamData.groupId}): ${newPrayerRequests[0].count}. Last viewed: ${lastViewTime}`);
    return res.json({ unreadCount: newPrayerRequests[0].count });
  } catch (error) {
    logger.error('Error fetching unread prayer requests:', error);
    // Ensure we haven't sent headers yet
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to fetch prayer request count",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
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