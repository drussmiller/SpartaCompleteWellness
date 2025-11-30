import { emailService } from './email-service';
import { smsService } from './sms-service';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface NotificationOptions {
  userId: number;
  subject: string;
  message: string;
  htmlMessage?: string;
}

class NotificationService {
  /**
   * Sends a notification to a user via their preferred channels (email and/or SMS)
   */
  async sendNotification(options: NotificationOptions): Promise<{
    emailSent: boolean;
    smsSent: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let emailSent = false;
    let smsSent = false;

    try {
      // Get user information
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, options.userId))
        .limit(1);

      if (!user) {
        errors.push('User not found');
        return { emailSent: false, smsSent: false, errors };
      }

      // Do not send notifications to users who are not in a team
      if (!user.teamId) {
        console.log(`⏭️  Skipping notification for user ${options.userId} - not in a team`);
        return { emailSent: false, smsSent: false, errors: ['User is not in a team'] };
      }

      // Send email notification
      if (user.email) {
        try {
          await emailService.sendEmail({
            to: user.email,
            subject: options.subject,
            html: options.htmlMessage || options.message,
            text: options.message,
          });
          emailSent = true;
          console.log(`✅ Email notification sent to user ${options.userId}`);
        } catch (error) {
          console.error(`Failed to send email to user ${options.userId}:`, error);
          errors.push(`Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Send SMS notification via Twilio
      if (user.smsEnabled && user.phoneNumber) {
        try {
          await smsService.sendSMSToUser(
            user.phoneNumber,
            options.message
          );
          smsSent = true;
          console.log(`✅ SMS notification sent to user ${options.userId}`);
        } catch (error) {
          console.error(`Failed to send SMS to user ${options.userId}:`, error);
          errors.push(`SMS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          smsSent = false;
        }
      }

      return { emailSent, smsSent, errors };
    } catch (error) {
      console.error('Error in notification service:', error);
      errors.push(`Notification service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { emailSent: false, smsSent: false, errors };
    }
  }

  /**
   * Sends notifications to multiple users
   */
  async sendBulkNotifications(
    notifications: NotificationOptions[]
  ): Promise<{
    sent: number;
    failed: number;
    details: Array<{ userId: number; emailSent: boolean; smsSent: boolean; errors: string[] }>;
  }> {
    let sent = 0;
    let failed = 0;
    const details = [];

    for (const notification of notifications) {
      const result = await this.sendNotification(notification);
      details.push({
        userId: notification.userId,
        ...result,
      });

      if (result.emailSent || result.smsSent) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed, details };
  }
}

export const notificationService = new NotificationService();
