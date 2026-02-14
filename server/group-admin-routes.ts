import { Router, Request, Response } from "express";
import { db } from "./db";
import { users, teams, groups, insertTeamSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authenticate } from "./auth";
import { logger } from "./logger";
import { storage } from "./storage";

export const groupAdminRouter = Router();

// Middleware to check if user is a group admin
async function requireGroupAdmin(req: Request, res: Response, next: Function) {
  try {
    if (!req.user?.isGroupAdmin || !req.user?.adminGroupId) {
      return res.status(403).json({ message: "Division Admin access required" });
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
      return res.status(404).json({ message: "Team not found or not in your division" });
    }
    
    // Validate update data
    const { name, description, maxSize, programStartDate } = req.body;
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
    
    if (programStartDate !== undefined) {
      if (programStartDate === null || programStartDate === '') {
        updateData.programStartDate = null;
      } else {
        updateData.programStartDate = new Date(programStartDate);
      }
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
      return res.status(404).json({ message: "Team not found or not in your division" });
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
      return res.status(404).json({ message: "Division not found" });
    }
    
    res.json(group);
  } catch (error) {
    logger.error('Error getting group info:', error);
    res.status(500).json({ message: "Failed to get group info" });
  }
});