import { db } from "./db";
import { users, posts, notifications, systemState } from "@shared/schema";
import { eq, gte, lt, and, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { smsService } from "./sms-service";
import { emailService } from "./email-service";

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
        programStartDate: users.programStartDate,
      })
      .from(users);

    logger.info(`[SCHEDULER] Found ${allUsers.length} users to check`);

    let notificationsCreated = 0;
    let smsNotificationsSent = 0;
    let emailNotificationsSent = 0;

    for (const user of allUsers) {
      try {
        if (!user.teamId) {
          logger.info(`[SCHEDULER] Skipping ${user.username} (ID: ${user.id}) - not in a team`);
          continue;
        }

        const offsetMinutes = user.timezoneOffset || 0;
        const userLocalNow = new Date(now.getTime() + offsetMinutes * 60000);
        const userLocalToday = new Date(userLocalNow);
        userLocalToday.setUTCHours(0, 0, 0, 0);
        const userLocalYesterday = new Date(userLocalToday.getTime() - 86400000);

        const todayUTC = new Date(userLocalToday.getTime() - offsetMinutes * 60000);
        const yesterdayUTC = new Date(userLocalYesterday.getTime() - offsetMinutes * 60000);

        const dayOfWeek = userLocalToday.getUTCDay();

        logger.info(`[SCHEDULER] User ${user.username} (ID: ${user.id}) timezone offset: ${offsetMinutes}min, local yesterday: ${userLocalYesterday.toISOString()}, query range UTC: ${yesterdayUTC.toISOString()} to ${todayUTC.toISOString()}`);

        if (user.programStartDate) {
          const startDateStr = String(user.programStartDate).split('T')[0];
          const [year, month, day] = startDateStr.split('-').map(Number);
          const programStart = new Date(year, month - 1, day);
          programStart.setHours(0, 0, 0, 0);
          if (programStart > todayUTC) {
            logger.info(`[SCHEDULER] Skipping ${user.username} (ID: ${user.id}) - program start date hasn't passed yet`);
            continue;
          }
        }

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
              gte(posts.createdAt, yesterdayUTC),
              lt(posts.createdAt, todayUTC),
              isNull(posts.parentId),
            ),
          );

        const userPosts = userPostsResult[0];
        const totalPoints = userPosts?.points || 0;
        const yesterdayDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const expectedPoints = yesterdayDayOfWeek === 6 ? 22 : yesterdayDayOfWeek === 0 ? 3 : 15;

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
                gte(posts.createdAt, yesterdayUTC),
                lt(posts.createdAt, todayUTC),
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

              // Send email for daily reminders (always when daily notifications are enabled)
              if (user.email) {
                try {
                  await emailService.sendDailyReminderEmail(user.email, user.username, message);
                  emailNotificationsSent++;
                  logger.info(`[SCHEDULER] 📧 Sent email to ${user.username} at ${user.email}`);
                } catch (emailError) {
                  logger.error(`[SCHEDULER] Failed to send email to ${user.username}:`, emailError);
                }
              }

              // Only send SMS for daily reminders if SMS is also enabled
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
      emailNotificationsSent,
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
    logger.info(`[SCHEDULER] Sent ${emailNotificationsSent} email notifications`);
    logger.info(`[SCHEDULER] Sent ${smsNotificationsSent} SMS notifications`);

    return summary;
  } catch (error) {
    logger.error("[SCHEDULER] Error in notification check:", error);
    throw error;
  }
}
