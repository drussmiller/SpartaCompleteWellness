import { Router, Request, Response } from "express";
import { db } from "./db";
import { verificationCodes } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { sendVerificationEmail } from "./email-service";
import { logger } from "./logger";

export const emailVerificationRouter = Router();

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification code to email
emailVerificationRouter.post("/api/auth/send-verification-code", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    // Check for recent verification code requests (rate limiting - 60 seconds)
    const recentCode = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, email),
          gt(verificationCodes.createdAt, new Date(Date.now() - 60000)) // Within last 60 seconds
        )
      )
      .limit(1);

    if (recentCode.length > 0) {
      return res.status(429).json({ 
        message: "Please wait 60 seconds before requesting another code" 
      });
    }

    // Generate new verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store verification code in database
    await db.insert(verificationCodes).values({
      email,
      code,
      expiresAt,
    });

    // Send email
    const sent = await sendVerificationEmail(email, code);

    if (!sent) {
      return res.status(500).json({ message: "Failed to send verification email" });
    }

    res.json({ 
      success: true, 
      message: "Verification code sent to your email" 
    });
  } catch (error) {
    logger.error("Error sending verification code:", error);
    res.status(500).json({ message: "Failed to send verification code" });
  }
});

// Verify email with code
emailVerificationRouter.post("/api/auth/verify-email-code", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    // Find the most recent verification code for this email
    const [verification] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, email),
          eq(verificationCodes.code, code)
        )
      )
      .orderBy(verificationCodes.createdAt)
      .limit(1);

    if (!verification) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Check if already verified
    if (verification.verified) {
      return res.json({ success: true, message: "Email already verified" });
    }

    // Check if expired
    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

    // Check attempts (max 3)
    if (verification.attempts >= 3) {
      return res.status(400).json({ 
        message: "Too many failed attempts. Please request a new code" 
      });
    }

    // Increment attempts
    await db
      .update(verificationCodes)
      .set({ 
        attempts: verification.attempts + 1,
        verified: true 
      })
      .where(eq(verificationCodes.id, verification.id));

    res.json({ 
      success: true, 
      message: "Email verified successfully" 
    });
  } catch (error) {
    logger.error("Error verifying email code:", error);
    res.status(500).json({ message: "Failed to verify email" });
  }
});
