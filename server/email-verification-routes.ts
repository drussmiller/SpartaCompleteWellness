import { Router, Request, Response } from "express";
import { db } from "./db";
import { verificationCodes, users } from "@shared/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import { sendVerificationEmail, sendPasswordResetCode } from "./email-service";
import { logger } from "./logger";
import { hashPassword } from "./auth";

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
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (recentCode.length > 0) {
      return res.status(429).json({ 
        message: "Please wait 60 seconds before requesting another code" 
      });
    }

    // Invalidate all previous unverified codes for this email
    await db
      .delete(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, email),
          eq(verificationCodes.verified, false)
        )
      );

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
      .where(eq(verificationCodes.email, email))
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!verification) {
      return res.status(400).json({ message: "No verification code found for this email" });
    }

    // Check if already verified
    if (verification.verified) {
      return res.json({ success: true, message: "Email already verified" });
    }

    // Check if expired
    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: "Verification code has expired. Please request a new code" });
    }

    // Check attempts (max 3 failed attempts)
    if (verification.attempts >= 3) {
      return res.status(400).json({ 
        message: "Too many failed attempts. Please request a new code" 
      });
    }

    // Verify the code
    if (verification.code !== code) {
      // Increment attempts on failure
      await db
        .update(verificationCodes)
        .set({ attempts: verification.attempts + 1 })
        .where(eq(verificationCodes.id, verification.id));
      
      return res.status(400).json({ 
        message: "Invalid verification code. Please try again" 
      });
    }

    // Mark as verified on success (don't increment attempts)
    await db
      .update(verificationCodes)
      .set({ verified: true })
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

// Send password reset code
emailVerificationRouter.post("/api/auth/send-reset-code", async (req: Request, res: Response) => {
  try {
    const { userIdentifier } = req.body;

    if (!userIdentifier) {
      return res.status(400).json({ message: "User ID or Preferred Name is required" });
    }

    let user = null;
    const userId = parseInt(userIdentifier);
    
    if (!isNaN(userId)) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      user = foundUser;
    }
    
    if (!user) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.preferredName}) = LOWER(${userIdentifier})`)
        .limit(1);
      user = foundUser;
    }
    
    if (!user || !user.email) {
      return res.json({ 
        success: true, 
        message: "If an account with that identifier exists, a password reset code has been sent." 
      });
    }

    const recentCode = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, user.email),
          gt(verificationCodes.createdAt, new Date(Date.now() - 60000))
        )
      )
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (recentCode.length > 0) {
      return res.status(429).json({ 
        message: "Please wait 60 seconds before requesting another code" 
      });
    }

    await db
      .delete(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, user.email),
          eq(verificationCodes.verified, false)
        )
      );

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(verificationCodes).values({
      email: user.email,
      code,
      expiresAt,
    });

    const sent = await sendPasswordResetCode(user.email, code);

    if (!sent) {
      return res.status(500).json({ message: "Failed to send password reset code" });
    }

    res.json({ 
      success: true, 
      message: "Password reset code sent to your email",
      email: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
    });
  } catch (error) {
    logger.error("Error sending password reset code:", error);
    res.status(500).json({ message: "Failed to send password reset code" });
  }
});

// Verify reset code and update password
emailVerificationRouter.post("/api/auth/verify-reset-code", async (req: Request, res: Response) => {
  try {
    const { userIdentifier, code, newPassword } = req.body;

    if (!userIdentifier || !code || !newPassword) {
      return res.status(400).json({ message: "User identifier, code, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    let user = null;
    const userId = parseInt(userIdentifier);
    
    if (!isNaN(userId)) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      user = foundUser;
    }
    
    if (!user) {
      const [foundUser] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.preferredName}) = LOWER(${userIdentifier})`)
        .limit(1);
      user = foundUser;
    }

    if (!user || !user.email) {
      return res.status(400).json({ message: "Invalid user identifier" });
    }

    const [verification] = await db
      .select()
      .from(verificationCodes)
      .where(
        and(
          eq(verificationCodes.email, user.email),
          eq(verificationCodes.code, code),
          eq(verificationCodes.verified, false)
        )
      )
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!verification) {
      return res.status(400).json({ message: "Invalid or expired verification code. Please request a new code" });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({ message: "Verification code has expired. Please request a new code" });
    }

    if (verification.attempts >= 3) {
      return res.status(400).json({ 
        message: "Too many failed attempts. Please request a new code" 
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, user.id));

    await db
      .delete(verificationCodes)
      .where(eq(verificationCodes.id, verification.id));

    logger.info(`Password reset successfully for user ${user.id}`);
    res.json({ 
      success: true, 
      message: "Password reset successfully. You can now log in with your new password" 
    });
  } catch (error) {
    logger.error("Error verifying reset code:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});
