import { Router, Request, Response } from "express";
import { db } from "./db";
import { users, teams, groups } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticate } from "./auth";
import { logger } from "./logger";
import { storage } from "./storage";

// Create a router for the user role endpoint
export const userRoleRouter = Router();

// Endpoint for updating user roles (admin/team lead)
userRoleRouter.patch("/api/users/:userId/role", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const { role, value } = req.body;
    if (!role || typeof value !== 'boolean') {
      return res.status(400).json({ message: "Invalid role parameters. Required: role and value" });
    }

    if (role !== 'isAdmin' && role !== 'isTeamLead' && role !== 'isGroupAdmin') {
      return res.status(400).json({ message: "Invalid role. Must be 'isAdmin', 'isTeamLead', or 'isGroupAdmin'" });
    }

    // Check authorization based on role being modified
    const isFullAdmin = req.user?.isAdmin;
    const isGroupAdmin = req.user?.isGroupAdmin;

    // Full admins can do anything
    if (!isFullAdmin) {
      // Group admins can only manage Team Lead roles
      if (role !== 'isTeamLead' || !isGroupAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Verify the target user is in the Group Admin's group
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser || !targetUser.teamId) {
        return res.status(400).json({ message: "User must be in a team" });
      }

      // Get the target user's team to find their group
      const [targetTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, targetUser.teamId))
        .limit(1);

      if (!targetTeam) {
        return res.status(400).json({ message: "User's team not found" });
      }

      // Verify the Group Admin has authority over this group
      if (targetTeam.groupId !== req.user.adminGroupId) {
        return res.status(403).json({ message: "You can only manage Team Leads in your own group" });
      }
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

    // For Group Admin role, verify permissions
    if (role === "isGroupAdmin") {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Only Admins can assign Group Admin role" });
      }

      // User must be in a team to be a Group Admin (only when adding the role)
      if (value) {
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!targetUser || !targetUser.teamId) {
          return res.status(400).json({ message: "User must be in a team to be a Group Admin" });
        }

        // Set adminGroupId to the group of their team when promoting to Group Admin
        const [team] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, targetUser.teamId))
          .limit(1);

        if (team) {
          await db
            .update(users)
            .set({ adminGroupId: team.groupId })
            .where(eq(users.id, userId));
        }
      } else {
        // Clear adminGroupId when removing Group Admin role (no team required)
        await db
          .update(users)
          .set({ adminGroupId: null })
          .where(eq(users.id, userId));
      }
    } else {
      // Update standard roles (isAdmin, isTeamLead)
      await db
        .update(users)
        .set({ [role]: value })
        .where(eq(users.id, userId));
    }

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