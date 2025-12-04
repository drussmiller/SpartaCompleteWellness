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

// Export as both individual functions and as a service object for compatibility
export { sendVerificationEmail, sendPasswordResetCode, sendFeedbackEmail };
export const emailService = {
  sendVerificationEmail,
  sendPasswordResetCode,
  sendFeedbackEmail,
};
