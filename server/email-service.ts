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

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
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
