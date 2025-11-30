import { db } from "./db";
import { users, posts, notifications, systemState } from "@shared/schema";
import { eq, gte, lt, and, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { smsService } from "./sms-service";

export async function checkNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    logger.info(`[SCHEDULER] Starting notification check at ${now.toISOString()}`);
    logger.info(`[SCHEDULER] Current UTC time: ${currentHour}:${String(currentMinute).padStart(2, '0')}`);

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        isAdmin: users.isAdmin,
        teamId: users.teamId,
        notificationTime: users.notificationTime,
        timezoneOffset: users.timezoneOffset,
        phoneNumber: users.phoneNumber,
        dailyNotificationsEnabled: users.dailyNotificationsEnabled,
        smsEnabled: users.smsEnabled,
      })
      .from(users);

    logger.info(`[SCHEDULER] Found ${allUsers.length} users to check`);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();

    let notificationsCreated = 0;
    let smsNotificationsSent = 0;

    for (const user of allUsers) {
      try {
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

        if (totalPoints < expectedPoints) {
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

          const missedItems: string[] = [];
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
              const lastItem = missedItems.pop()!;
              message += missedItems.join(", ") + ", and " + lastItem + ".";
            }
          } else {
            message = `Your total points for yesterday was ${totalPoints}. You should aim for ${expectedPoints} points daily for optimal progress!`;
          }

          const notificationTimeParts = user.notificationTime
            ? user.notificationTime.split(":")
            : ["8", "00"];
          const preferredLocalHour = parseInt(notificationTimeParts[0]);
          const preferredLocalMinute = parseInt(notificationTimeParts[1] || "0");

          const timezoneOffsetMinutes = user.timezoneOffset || 0;
          const timezoneOffsetHours = timezoneOffsetMinutes / 60;
          const preferredUTCHour = Math.floor((preferredLocalHour - timezoneOffsetHours + 24) % 24);
          const preferredUTCMinute = preferredLocalMinute;

          const isPreferredTimeWindow =
            (currentHour === preferredUTCHour &&
              currentMinute >= preferredUTCMinute &&
              currentMinute < preferredUTCMinute + 10) ||
            (currentHour === preferredUTCHour + 1 &&
              preferredUTCMinute >= 50 &&
              currentMinute < (preferredUTCMinute + 10) % 60);

          const fiftyFiveMinutesAgo = new Date(now.getTime() - 55 * 60 * 1000);
          const recentNotifications = await db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, user.id),
                gte(notifications.createdAt, fiftyFiveMinutesAgo),
              ),
            );

          if (isPreferredTimeWindow && recentNotifications.length === 0) {
            if (user.dailyNotificationsEnabled) {
              await db.insert(notifications).values({
                userId: user.id,
                title: "Daily Accountability Reminder",
                message,
                type: "missed_post",
              });

              notificationsCreated++;
              logger.info(`[SCHEDULER] ✅ Created notification for ${user.username} (ID: ${user.id})`);
            }

            if (user.smsEnabled && user.phoneNumber) {
              try {
                await smsService.sendSMSToUser(user.phoneNumber, message);
                smsNotificationsSent++;
                logger.info(`[SCHEDULER] 📱 Sent SMS to ${user.username} at ${user.phoneNumber}`);
              } catch (smsError) {
                logger.error(`[SCHEDULER] Failed to send SMS to ${user.username}:`, smsError);
              }
            }
          }
        }
      } catch (userError) {
        logger.error(`[SCHEDULER] Error processing user ${user.username} (ID: ${user.id}):`, userError);
      }
    }

    const summary = {
      success: true,
      timestamp: now.toISOString(),
      utcTime: `${currentHour}:${String(currentMinute).padStart(2, '0')}`,
      notificationsCreated,
      smsNotificationsSent,
      usersChecked: allUsers.length,
    };

    await db
      .insert(systemState)
      .values({
        key: "last_notification_check",
        value: JSON.stringify(summary),
      })
      .onConflictDoUpdate({
        target: systemState.key,
        set: {
          value: JSON.stringify(summary),
          updatedAt: now,
        },
      });

    logger.info(`[SCHEDULER] ✅ Notification check completed successfully`);
    logger.info(`[SCHEDULER] Created ${notificationsCreated} in-app notifications`);
    logger.info(`[SCHEDULER] Sent ${smsNotificationsSent} SMS notifications`);

    return summary;
  } catch (error) {
    logger.error("[SCHEDULER] Error in notification check:", error);
    throw error;
  }
}
