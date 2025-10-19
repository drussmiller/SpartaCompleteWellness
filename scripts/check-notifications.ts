#!/usr/bin/env tsx

import { db } from "../server/db";
import { users, posts, notifications } from "../shared/schema";
import { eq, gte, lt, and, isNull, sql } from "drizzle-orm";

console.log("[SCHEDULER] Starting notification check at", new Date().toISOString());

async function checkNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    console.log(`[SCHEDULER] Current UTC time: ${currentHour}:${String(currentMinute).padStart(2, '0')}`);

    // Get all users
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        isAdmin: users.isAdmin,
        teamId: users.teamId,
        notificationTime: users.notificationTime,
        timezoneOffset: users.timezoneOffset,
      })
      .from(users);

    console.log(`[SCHEDULER] Found ${allUsers.length} users to check`);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();

    for (const user of allUsers) {
      try {
        // Check user's daily points
        const userPostsResult = await db
          .select({
            points: sql<number>`coalesce(sum(${posts.points}), 0)::integer`,
            types: sql<string[]>`array_agg(distinct ${posts.type})`,
            count: sql<number>`count(*)::integer`,
          })
          .from(posts)
          .where(
            and(
              eq(posts.userId, user.id),
              gte(posts.createdAt, yesterday),
              lt(posts.createdAt, today),
              isNull(posts.parentId),
            ),
          );

        const userPosts = userPostsResult[0];
        const totalPoints = userPosts?.points || 0;
        const expectedPoints = dayOfWeek === 6 ? 22 : dayOfWeek === 0 ? 3 : 15;

        // Only process if user didn't meet their goal
        if (totalPoints < expectedPoints) {
          // Calculate what they missed
          const postsByType = await db
            .select({
              type: posts.type,
              count: sql<number>`count(*)::integer`,
            })
            .from(posts)
            .where(
              and(
                eq(posts.userId, user.id),
                gte(posts.createdAt, yesterday),
                lt(posts.createdAt, today),
                isNull(posts.parentId),
              ),
            )
            .groupBy(posts.type);

          const counts: Record<string, number> = {
            food: 0,
            workout: 0,
            scripture: 0,
            memory_verse: 0,
          };

          postsByType.forEach((post) => {
            if (post.type in counts) {
              counts[post.type] = post.count;
            }
          });

          const missedItems = [];
          const yesterdayDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

          if (yesterdayDayOfWeek !== 0 && counts.food < 3) {
            missedItems.push(`${3 - counts.food} meals`);
          }

          if (yesterdayDayOfWeek !== 0 && counts.workout < 1) {
            missedItems.push("your workout");
          }

          if (counts.scripture < 1) {
            missedItems.push("your scripture reading");
          }

          if (yesterdayDayOfWeek === 6 && counts.memory_verse < 1) {
            missedItems.push("your memory verse");
          }

          let message = "";
          if (missedItems.length > 0) {
            message = "Yesterday you missed posting ";

            if (missedItems.length === 1) {
              message += missedItems[0] + ".";
            } else if (missedItems.length === 2) {
              message += missedItems[0] + " and " + missedItems[1] + ".";
            } else {
              const lastItem = missedItems.pop();
              message += missedItems.join(", ") + ", and " + lastItem + ".";
            }
          } else {
            message = `Your total points for yesterday was ${totalPoints}. You should aim for ${expectedPoints} points daily for optimal progress!`;
          }

          // Parse notification time
          const notificationTimeParts = user.notificationTime
            ? user.notificationTime.split(":")
            : ["8", "00"];
          const preferredLocalHour = parseInt(notificationTimeParts[0]);
          const preferredLocalMinute = parseInt(notificationTimeParts[1] || "0");

          // Convert local time to UTC
          const timezoneOffsetMinutes = user.timezoneOffset || 0;
          const timezoneOffsetHours = timezoneOffsetMinutes / 60;
          const preferredUTCHour = Math.floor((preferredLocalHour - timezoneOffsetHours + 24) % 24);
          const preferredUTCMinute = preferredLocalMinute;

          // Check if we're in the notification time window (10-minute window)
          const isPreferredTimeWindow =
            (currentHour === preferredUTCHour &&
              currentMinute >= preferredUTCMinute &&
              currentMinute < preferredUTCMinute + 10) ||
            (currentHour === preferredUTCHour + 1 &&
              preferredUTCMinute >= 50 &&
              currentMinute < (preferredUTCMinute + 10) % 60);

          // Check if notification was sent in last 55 minutes
          const fiftyFiveMinutesAgo = new Date(now.getTime() - 55 * 60 * 1000);
          const recentNotifications = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, user.id),
                eq(notifications.type, "reminder"),
                gte(notifications.createdAt, fiftyFiveMinutesAgo),
              ),
            );

          console.log(`[SCHEDULER] User ${user.username}:`, {
            currentTime: `${currentHour}:${String(currentMinute).padStart(2, '0')} UTC`,
            preferredUTCTime: `${String(preferredUTCHour).padStart(2, '0')}:${String(preferredUTCMinute).padStart(2, '0')} UTC`,
            isPreferredTimeWindow,
            recentNotifications: recentNotifications.length,
          });

          if (isPreferredTimeWindow && recentNotifications.length === 0) {
            const notification = {
              userId: user.id,
              title: "Daily Reminder",
              message,
              read: false,
              createdAt: new Date(),
              type: "reminder" as const,
              sound: "default",
            };

            const [insertedNotification] = await db
              .insert(notifications)
              .values(notification)
              .returning();

            console.log(`[SCHEDULER] ✅ Created notification for ${user.username} (ID: ${insertedNotification.id})`);
          } else if (!isPreferredTimeWindow) {
            console.log(`[SCHEDULER] ⏸️  User ${user.username} - not in time window`);
          } else {
            console.log(`[SCHEDULER] ⏭️  User ${user.username} - already notified recently`);
          }
        } else {
          console.log(`[SCHEDULER] ✓ User ${user.username} met their goal`);
        }
      } catch (userError) {
        console.error(`[SCHEDULER] Error processing user ${user.id}:`, userError);
        continue;
      }
    }

    console.log("[SCHEDULER] Notification check completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("[SCHEDULER] Fatal error:", error);
    process.exit(1);
  }
}

// Run the check
checkNotifications();
