import { Router, Request, Response } from "express";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticate } from "./auth";
import { logger } from "./logger";

// Create a router for the user role endpoint
export const userRoleRouter = Router();

// Endpoint for updating user roles (admin/team lead)
userRoleRouter.patch("/api/users/:userId/role", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const { role, value } = req.body;
    if (!role || typeof value !== 'boolean') {
      return res.status(400).json({ message: "Invalid role parameters. Required: role and value" });
    }

    if (role !== 'isAdmin' && role !== 'isTeamLead') {
      return res.status(400).json({ message: "Invalid role. Must be 'isAdmin' or 'isTeamLead'" });
    }

    // Don't allow removing admin from primary admin account
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.username === "admin" && role === "isAdmin" && !value) {
      return res.status(400).json({ message: "Cannot remove admin role from primary admin account" });
    }

    // Update the user's role
    await db
      .update(users)
      .set({ [role]: value })
      .where(eq(users.id, userId));

    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json(updatedUser);
  } catch (error) {
    logger.error('Error updating user role:', error);
    res.status(500).json({
      message: "Failed to update user role",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});