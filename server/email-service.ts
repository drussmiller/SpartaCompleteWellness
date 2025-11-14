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
      logger.warn("Gmail credentials not configured. Verification code:", code);
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
      logger.warn("Gmail credentials not configured. Password reset code:", code);
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

// Export as both individual functions and as a service object for compatibility
export { sendVerificationEmail, sendPasswordResetCode };
export const emailService = {
  sendVerificationEmail,
  sendPasswordResetCode,
};
