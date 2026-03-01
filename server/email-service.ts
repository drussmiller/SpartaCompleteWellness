import nodemailer from "nodemailer";
import { logger } from "./logger";

// Create transporter for email service using Gmail
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
});

async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured.", { code });
      // In development, just log the code
      console.log(`\n=== EMAIL VERIFICATION CODE for ${email} ===`);
      console.log(`Code: ${code}`);
      console.log(`This code expires in 10 minutes.`);
      console.log(`=======================================\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Team Fitness Tracker - Email Verification",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Email Verification</h2>
          <p>Thank you for registering with Team Fitness Tracker!</p>
          <p>Your verification code is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
      text: `Your Team Fitness Tracker verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Verification email sent to ${email}`);
    return true;
  } catch (error) {
    logger.error("Error sending verification email:", error);
    // In development, still log the code
    console.log(`\n=== EMAIL VERIFICATION CODE for ${email} ===`);
    console.log(`Code: ${code}`);
    console.log(`This code expires in 10 minutes.`);
    console.log(`=======================================\n`);
    return true; // Return true anyway so registration isn't blocked
  }
}

async function sendPasswordResetCode(email: string, code: string): Promise<boolean> {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured.", { code });
      // In development, just log the code
      console.log(`\n=== PASSWORD RESET CODE for ${email} ===`);
      console.log(`Code: ${code}`);
      console.log(`This code expires in 10 minutes.`);
      console.log(`=======================================\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Team Fitness Tracker - Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>You requested a password reset for your Team Fitness Tracker account.</p>
          <p>Your password reset code is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
        </div>
      `,
      text: `Your Team Fitness Tracker password reset code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this password reset, please ignore this email.`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Password reset code sent to ${email}`);
    return true;
  } catch (error) {
    logger.error("Error sending password reset code:", error);
    // In development, still log the code
    console.log(`\n=== PASSWORD RESET CODE for ${email} ===`);
    console.log(`Code: ${code}`);
    console.log(`This code expires in 10 minutes.`);
    console.log(`=======================================\n`);
    return true; // Return true anyway so password reset isn't blocked
  }
}

async function sendFeedbackEmail(
  subject: string,
  message: string,
  userName: string,
  userEmail: string,
  userPhone?: string | null
): Promise<boolean> {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured. Logging feedback to console.");
      console.log(`\n=== FEEDBACK SUBMISSION ===`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      console.log(`From: ${userName} (${userEmail})`);
      if (userPhone) console.log(`Phone: ${userPhone}`);
      console.log(`=======================================\n`);
      return true;
    }

    const userInfoHtml = `
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #ccc;" />
      <p style="color: #666; font-size: 14px;">
        <strong>Submitted by:</strong><br />
        Name: ${userName}<br />
        Email: ${userEmail}${userPhone ? `<br />Phone: ${userPhone}` : ''}
      </p>
    `;

    const userInfoText = `\n\n---\nSubmitted by:\nName: ${userName}\nEmail: ${userEmail}${userPhone ? `\nPhone: ${userPhone}` : ''}`;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: "SpartaCompleteWellnessApp@gmail.com",
      subject: `Feedback: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Feedback Submission</h2>
          <p><strong>Subject:</strong> ${subject}</p>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-left: 4px solid #6366F1;">
            ${message.replace(/\n/g, '<br />')}
          </div>
          ${userInfoHtml}
        </div>
      `,
      text: `New Feedback Submission\n\nSubject: ${subject}\n\n${message}${userInfoText}`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Feedback email sent to SpartaCompleteWellnessApp@gmail.com`);
    return true;
  } catch (error) {
    logger.error("Error sending feedback email:", error);
    console.log(`\n=== FEEDBACK SUBMISSION (Error occurred) ===`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    console.log(`From: ${userName} (${userEmail})`);
    if (userPhone) console.log(`Phone: ${userPhone}`);
    console.log(`=======================================\n`);
    return true;
  }
}

async function sendDailyReminderEmail(
  email: string,
  username: string,
  message: string
): Promise<boolean> {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured. Logging daily reminder to console.");
      console.log(`\n=== DAILY REMINDER EMAIL for ${username} (${email}) ===`);
      console.log(`Message: ${message}`);
      console.log(`=======================================\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Sparta Complete Wellness - Daily Accountability Reminder",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Daily Accountability Reminder</h2>
          <p>Hi ${username},</p>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-left: 4px solid #6366F1;">
            ${message}
          </div>
          <p>Keep up the great work on your wellness journey!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            You're receiving this email because you have daily reminders enabled in the Sparta Complete Wellness app.
            To adjust your notification preferences, visit the Notification Settings in the app.
          </p>
        </div>
      `,
      text: `Daily Accountability Reminder\n\nHi ${username},\n\n${message}\n\nKeep up the great work on your wellness journey!\n\nYou're receiving this email because you have daily reminders enabled in the Sparta Complete Wellness app.`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Daily reminder email sent to ${email}`);
    return true;
  } catch (error) {
    logger.error("Error sending daily reminder email:", error);
    console.log(`\n=== DAILY REMINDER EMAIL (Error occurred) for ${username} (${email}) ===`);
    console.log(`Message: ${message}`);
    console.log(`=======================================\n`);
    return false;
  }
}

async function sendInviteCodeEmail(
  recipientEmail: string,
  recipientName: string,
  inviteCode: string,
  teamName: string,
  role: string,
  senderName: string
): Promise<boolean> {
  try {
    const roleDisplay = role === "team_admin" ? "Team Lead" : "Team Member";

    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured. Logging invite code to console.");
      console.log(`\n=== INVITE CODE EMAIL for ${recipientName} (${recipientEmail}) ===`);
      console.log(`Code: ${inviteCode}`);
      console.log(`Team: ${teamName}`);
      console.log(`Role: ${roleDisplay}`);
      console.log(`Sent by: ${senderName}`);
      console.log(`=======================================\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: recipientEmail,
      subject: `Sparta Complete Wellness - You've been invited to join ${teamName}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">You're Invited!</h2>
          <p>Hi ${recipientName},</p>
          <p>${senderName} has invited you to join <strong>${teamName}</strong> as a <strong>${roleDisplay}</strong>.</p>
          <p>Use the following invite code in the app to join:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 3px; margin: 20px 0; border-radius: 8px;">
            ${inviteCode}
          </div>
          <p>To use this code:</p>
          <ol>
            <li>Open the Sparta Complete Wellness app</li>
            <li>Go to Menu and tap "Join a Team"</li>
            <li>Enter the invite code above</li>
          </ol>
          <p>We look forward to having you on the team!</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated message from Sparta Complete Wellness.
          </p>
        </div>
      `,
      text: `Hi ${recipientName},\n\n${senderName} has invited you to join ${teamName} as a ${roleDisplay}.\n\nYour invite code is: ${inviteCode}\n\nTo use this code:\n1. Open the Sparta Complete Wellness app\n2. Go to Menu and tap "Join a Team"\n3. Enter the invite code above\n\nWe look forward to having you on the team!`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Invite code email sent to ${recipientEmail} for team ${teamName}`);
    return true;
  } catch (error) {
    logger.error("Error sending invite code email:", error);
    console.log(`\n=== INVITE CODE EMAIL (Error occurred) for ${recipientName} (${recipientEmail}) ===`);
    console.log(`Code: ${inviteCode}`);
    console.log(`Team: ${teamName}`);
    console.log(`Role: ${role === "team_admin" ? "Team Lead" : "Team Member"}`);
    console.log(`=======================================\n`);
    return false;
  }
}

async function sendGenericNotificationEmail(
  recipientEmail: string,
  subject: string,
  message: string
): Promise<boolean> {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASSWORD) {
      logger.warn("Gmail credentials not configured. Logging notification to console.");
      console.log(`\n=== NOTIFICATION EMAIL for ${recipientEmail} ===`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      console.log(`=======================================\n`);
      return true;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: recipientEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${subject}</h2>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-left: 4px solid #6366F1;">
            <p>${message}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated message from Sparta Complete Wellness.
          </p>
        </div>
      `,
      text: `${subject}\n\n${message}`,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Notification email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error("Error sending notification email:", error);
    return false;
  }
}

export { sendVerificationEmail, sendPasswordResetCode, sendFeedbackEmail, sendDailyReminderEmail, sendInviteCodeEmail, sendGenericNotificationEmail };
export const emailService = {
  sendVerificationEmail,
  sendPasswordResetCode,
  sendFeedbackEmail,
  sendDailyReminderEmail,
  sendInviteCodeEmail,
  sendGenericNotificationEmail,
};
