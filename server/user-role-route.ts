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

    if (role !== 'isAdmin' && role !== 'isOrganizationAdmin' && role !== 'isTeamLead' && role !== 'isGroupAdmin') {
      return res.status(400).json({ message: "Invalid role. Must be 'isAdmin', 'isOrganizationAdmin', 'isTeamLead', or 'isGroupAdmin'" });
    }

    // Check authorization based on role being modified
    const isFullAdmin = req.user?.isAdmin;
    const isOrgAdmin = req.user?.isOrganizationAdmin;
    const isGroupAdmin = req.user?.isGroupAdmin;
    const isTeamLead = req.user?.isTeamLead;

    // Full admins can do anything
    if (!isFullAdmin) {
      // Only full admins can assign Admin or Organization Admin roles
      if (role === 'isAdmin' || role === 'isOrganizationAdmin') {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Organization admins can assign Group Admin and Team Lead roles
      if (isOrgAdmin && (role === 'isGroupAdmin' || role === 'isTeamLead')) {
        // Allowed - will be further scoped below
      }
      // Group admins and Team Leads can only manage Team Lead roles
      else if (role !== 'isTeamLead') {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (!isOrgAdmin && !isGroupAdmin && !isTeamLead) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Get the target user
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser || !targetUser.teamId) {
        return res.status(400).json({ message: "User must be in a team" });
      }

      // Team Leads can only manage users in their own team
      if (isTeamLead && !isFullAdmin && !isGroupAdmin) {
        if (targetUser.teamId !== req.user.teamId) {
          return res.status(403).json({ message: "You can only manage Team Leads in your own team" });
        }
      }

      // Group Admins can only manage users in their group
      if (isGroupAdmin && !isFullAdmin) {
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
          return res.status(403).json({ message: "You can only manage Team Leads in your own division" });
        }
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

    // For Organization Admin role, verify permissions and set adminOrganizationId
    if (role === "isOrganizationAdmin") {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Only Admins can assign Organization Admin role" });
      }

      if (value) {
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (targetUser?.teamId) {
          const [team] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, targetUser.teamId))
            .limit(1);

          if (team) {
            const [teamGroup] = await db
              .select()
              .from(groups)
              .where(eq(groups.id, team.groupId))
              .limit(1);

            if (teamGroup) {
              await db
                .update(users)
                .set({ isOrganizationAdmin: true, adminOrganizationId: teamGroup.organizationId })
                .where(eq(users.id, userId));
            } else {
              await db
                .update(users)
                .set({ isOrganizationAdmin: true })
                .where(eq(users.id, userId));
            }
          } else {
            await db
              .update(users)
              .set({ isOrganizationAdmin: true })
              .where(eq(users.id, userId));
          }
        } else {
          await db
            .update(users)
            .set({ isOrganizationAdmin: true })
            .where(eq(users.id, userId));
        }
      } else {
        await db
          .update(users)
          .set({ isOrganizationAdmin: false, adminOrganizationId: null })
          .where(eq(users.id, userId));
      }
    }
    // For Group Admin role, verify permissions
    else if (role === "isGroupAdmin") {
      if (!req.user.isAdmin && !req.user.isOrganizationAdmin) {
        return res.status(403).json({ message: "Only Admins or Organization Admins can assign Division Admin role" });
      }

      if (value) {
        // When promoting to Group Admin, set adminGroupId based on their team if they have one
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (targetUser?.teamId) {
          const [team] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, targetUser.teamId))
            .limit(1);

          if (team) {
            await db
              .update(users)
              .set({ isGroupAdmin: true, adminGroupId: team.groupId })
              .where(eq(users.id, userId));
          } else {
            // If team not found, just set the role
            await db
              .update(users)
              .set({ isGroupAdmin: true })
              .where(eq(users.id, userId));
          }
        } else {
          // If no team, adminGroupId will remain null and can be set later
          await db
            .update(users)
            .set({ isGroupAdmin: true })
            .where(eq(users.id, userId));
        }
      } else {
        // Clear adminGroupId AND isGroupAdmin when removing Group Admin role
        await db
          .update(users)
          .set({ isGroupAdmin: false, adminGroupId: null })
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