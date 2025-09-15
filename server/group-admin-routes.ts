import { Router, Request, Response } from "express";
import { db } from "./db";
import { users, teams, groups, insertTeamSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authenticate } from "./auth";
import { logger } from "./logger";
import { storage } from "./storage";
import { z } from "zod";

export const groupAdminRouter = Router();

// Middleware to check if user is a group admin
async function requireGroupAdmin(req: Request, res: Response, next: Function) {
  try {
    if (!req.user?.isGroupAdmin || !req.user?.adminGroupId) {
      return res.status(403).json({ message: "Group Admin access required" });
    }
    next();
  } catch (error) {
    logger.error('Error checking group admin status:', error);
    res.status(500).json({ message: "Failed to verify permissions" });
  }
}

// Get teams in the group that user is admin of
groupAdminRouter.get("/api/group-admin/teams", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    const teams = await storage.getTeamsByGroup(groupId);
    
    // Get member count for each team
    const teamsWithCounts = await Promise.all(
      teams.map(async (team) => ({
        ...team,
        memberCount: await storage.getTeamMemberCount(team.id)
      }))
    );
    
    res.json(teamsWithCounts);
  } catch (error) {
    logger.error('Error getting teams for group admin:', error);
    res.status(500).json({ message: "Failed to get teams" });
  }
});

// Create a new team in the group
groupAdminRouter.post("/api/group-admin/teams", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    
    // Validate request body
    const validation = insertTeamSchema.safeParse({
      ...req.body,
      groupId
    });
    
    if (!validation.success) {
      return res.status(400).json({ 
        message: "Invalid team data",
        errors: validation.error.errors
      });
    }
    
    const teamData = validation.data;
    const team = await storage.createTeam(teamData);
    
    res.status(201).json(team);
  } catch (error) {
    logger.error('Error creating team:', error);
    res.status(500).json({ message: "Failed to create team" });
  }
});

// Update team (rename or change max size)
groupAdminRouter.patch("/api/group-admin/teams/:teamId", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }
    
    const groupId = req.user!.adminGroupId!;
    
    // Verify the team belongs to the admin's group
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.groupId, groupId)))
      .limit(1);
      
    if (!team) {
      return res.status(404).json({ message: "Team not found or not in your group" });
    }
    
    // Validate update data
    const { name, description, maxSize } = req.body;
    const updateData: any = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Team name must be a non-empty string" });
      }
      updateData.name = name.trim();
    }
    
    if (description !== undefined) {
      updateData.description = description;
    }
    
    if (maxSize !== undefined) {
      if (typeof maxSize !== 'number' || maxSize < 1) {
        return res.status(400).json({ message: "Max size must be a positive number" });
      }
      
      // Check if current member count exceeds new max size
      const currentMemberCount = await storage.getTeamMemberCount(teamId);
      if (currentMemberCount > maxSize) {
        return res.status(400).json({ 
          message: `Cannot set max size to ${maxSize}. Team currently has ${currentMemberCount} members.`
        });
      }
      
      updateData.maxSize = maxSize;
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    const updatedTeam = await storage.updateTeam(teamId, updateData);
    
    // Get member count for response
    const memberCount = await storage.getTeamMemberCount(teamId);
    
    res.json({
      ...updatedTeam,
      memberCount
    });
  } catch (error) {
    logger.error('Error updating team:', error);
    res.status(500).json({ message: "Failed to update team" });
  }
});

// Delete a team (only if empty)
groupAdminRouter.delete("/api/group-admin/teams/:teamId", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }
    
    const groupId = req.user!.adminGroupId!;
    
    // Verify the team belongs to the admin's group
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.groupId, groupId)))
      .limit(1);
      
    if (!team) {
      return res.status(404).json({ message: "Team not found or not in your group" });
    }
    
    // Check if team has members
    const memberCount = await storage.getTeamMemberCount(teamId);
    if (memberCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete team with ${memberCount} members. Move members to other teams first.`
      });
    }
    
    await storage.deleteTeam(teamId);
    
    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    logger.error('Error deleting team:', error);
    res.status(500).json({ message: "Failed to delete team" });
  }
});

// Get group info for the admin
groupAdminRouter.get("/api/group-admin/group", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    
    const [group] = await db
      .select()
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
      
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }
    
    res.json(group);
  } catch (error) {
    logger.error('Error getting group info:', error);
    res.status(500).json({ message: "Failed to get group info" });
  }
});

// Get all users in the admin's group
groupAdminRouter.get("/api/group-admin/users", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    
    // Get all users in teams that belong to this group
    const usersInGroup = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        imageUrl: users.imageUrl,
        isTeamLead: users.isTeamLead,
        teamId: users.teamId,
        teamJoinedAt: users.teamJoinedAt,
        teamName: teams.name,
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(eq(teams.groupId, groupId));
    
    res.json(usersInGroup);
  } catch (error) {
    logger.error('Error getting users for group admin:', error);
    res.status(500).json({ message: "Failed to get users" });
  }
});

// Move user between teams within the group
groupAdminRouter.patch("/api/group-admin/users/:userId/team", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Validate request body
    const moveUserSchema = z.object({
      teamId: z.number().int().positive()
    });
    
    const validation = moveUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        message: "Invalid request data",
        errors: validation.error.errors
      });
    }
    
    const { teamId } = validation.data;
    
    // Verify user exists and is in a team within this group
    const [currentUser] = await db
      .select({
        id: users.id,
        currentTeamId: users.teamId,
        groupId: teams.groupId,
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(eq(users.id, userId))
      .limit(1);
      
    if (!currentUser || currentUser.groupId !== groupId) {
      return res.status(404).json({ message: "User not found in your group" });
    }
    
    // Verify target team exists and belongs to this group
    const [targetTeam] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.groupId, groupId)))
      .limit(1);
      
    if (!targetTeam) {
      return res.status(404).json({ message: "Target team not found in your group" });
    }
    
    // Check if target team has space (if maxSize is set)
    if (targetTeam.maxSize) {
      const currentMemberCount = await storage.getTeamMemberCount(teamId);
      if (currentMemberCount >= targetTeam.maxSize) {
        return res.status(400).json({ 
          message: `Cannot move user: team "${targetTeam.name}" is at maximum capacity (${targetTeam.maxSize} members)` 
        });
      }
    }
    
    // Update user's team
    await storage.updateUser(userId, { 
      teamId,
      teamJoinedAt: new Date(),
      isTeamLead: false // Reset team lead status when moving teams
    });
    
    res.json({ message: "User moved successfully" });
  } catch (error) {
    logger.error('Error moving user between teams:', error);
    res.status(500).json({ message: "Failed to move user" });
  }
});

// Update user profile (limited fields only)
groupAdminRouter.patch("/api/group-admin/users/:userId", authenticate, requireGroupAdmin, async (req: Request, res: Response) => {
  try {
    const groupId = req.user!.adminGroupId!;
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Validate request body
    const updateUserSchema = z.object({
      isTeamLead: z.boolean().optional()
    });
    
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        message: "Invalid request data",
        errors: validation.error.errors
      });
    }
    
    const updateData = validation.data;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    
    // Verify user exists and is in this group
    const [currentUser] = await db
      .select({
        id: users.id,
        groupId: teams.groupId,
      })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .where(eq(users.id, userId))
      .limit(1);
      
    if (!currentUser || currentUser.groupId !== groupId) {
      return res.status(404).json({ message: "User not found in your group" });
    }
    
    await storage.updateUser(userId, updateData);
    
    res.json({ message: "User updated successfully" });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ message: "Failed to update user" });
  }
});