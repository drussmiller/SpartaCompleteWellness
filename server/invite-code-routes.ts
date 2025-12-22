import { Router, Request, Response } from "express";
import { db } from "./db";
import { groups, teams, users } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { authenticate } from "./auth";
import { generateInviteCode } from "./invite-code-utils";
import { logger } from "./logger";

// Helper function to get next Monday (or today if today is Monday) in user's timezone
function getNextMondayLocal(utcDate: Date, timezoneOffsetMinutes: number): Date {
  // Convert UTC time to user's local time
  const localTime = new Date(utcDate.getTime() - (timezoneOffsetMinutes * 60000));
  
  // Get day of week in user's timezone
  const dayOfWeek = localTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate the target date
  let targetDate = new Date(localTime);
  targetDate.setHours(0, 0, 0, 0);
  
  if (dayOfWeek === 1) {
    // Today is Monday in user's timezone, use today
    // Keep targetDate as is
  } else if (dayOfWeek === 0) {
    // Today is Sunday, next Monday is tomorrow
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    // Today is Tue-Sat, calculate days until next Monday
    const daysUntilMonday = 8 - dayOfWeek;
    targetDate.setDate(targetDate.getDate() + daysUntilMonday);
  }
  
  // Convert back to UTC by adding the timezone offset
  const utcResult = new Date(targetDate.getTime() + (timezoneOffsetMinutes * 60000));
  return utcResult;
}

export const inviteCodeRouter = Router();

inviteCodeRouter.get("/api/invite-codes/group/:groupId", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { type } = req.query;
    
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    if (!type || (type !== "group_admin" && type !== "group_member")) {
      return res.status(400).json({ message: "Invalid invite type" });
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const needsGeneration = 
      (type === "group_admin" && !group.groupAdminInviteCode) ||
      (type === "group_member" && !group.groupMemberInviteCode);

    if (needsGeneration) {
      if (!req.user?.isAdmin && !(req.user?.isGroupAdmin && req.user?.adminGroupId === groupId)) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updateData: any = {};
      if (type === "group_admin") {
        updateData.groupAdminInviteCode = generateInviteCode();
      } else {
        updateData.groupMemberInviteCode = generateInviteCode();
      }

      const [updatedGroup] = await db
        .update(groups)
        .set(updateData)
        .where(eq(groups.id, groupId))
        .returning();

      const inviteCode = type === "group_admin" 
        ? updatedGroup.groupAdminInviteCode 
        : updatedGroup.groupMemberInviteCode;
      
      return res.json({ inviteCode });
    }

    const inviteCode = type === "group_admin" 
      ? group.groupAdminInviteCode 
      : group.groupMemberInviteCode;
    
    res.json({ inviteCode });
  } catch (error) {
    logger.error("Error fetching group invite code:", error);
    res.status(500).json({ message: "Failed to fetch invite code" });
  }
});

inviteCodeRouter.get("/api/invite-codes/team/:teamId", authenticate, async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { type } = req.query;
    
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    if (!type || (type !== "team_admin" && type !== "team_member")) {
      return res.status(400).json({ message: "Invalid invite type" });
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, team.groupId)).limit(1);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const needsGeneration = 
      (type === "team_admin" && !team.teamAdminInviteCode) ||
      (type === "team_member" && !team.teamMemberInviteCode);

    if (needsGeneration) {
      const isTeamLeadForThisTeam = req.user?.isTeamLead && req.user?.adminTeamId === teamId;
      if (!req.user?.isAdmin && !(req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId) && !isTeamLeadForThisTeam) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updateData: any = {};
      if (type === "team_admin") {
        updateData.teamAdminInviteCode = generateInviteCode();
      } else {
        updateData.teamMemberInviteCode = generateInviteCode();
      }

      const [updatedTeam] = await db
        .update(teams)
        .set(updateData)
        .where(eq(teams.id, teamId))
        .returning();

      const inviteCode = type === "team_admin" 
        ? updatedTeam.teamAdminInviteCode 
        : updatedTeam.teamMemberInviteCode;
      
      return res.json({ inviteCode });
    }

    const inviteCode = type === "team_admin" 
      ? team.teamAdminInviteCode 
      : team.teamMemberInviteCode;
    
    res.json({ inviteCode });
  } catch (error) {
    logger.error("Error fetching team invite code:", error);
    res.status(500).json({ message: "Failed to fetch invite code" });
  }
});

inviteCodeRouter.post("/api/groups/:groupId/generate-invite-code", authenticate, async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { type } = req.body;
    
    if (isNaN(groupId)) {
      return res.status(400).json({ message: "Invalid group ID" });
    }

    if (!type || (type !== "group_admin" && type !== "group_member")) {
      return res.status(400).json({ message: "Invalid invite type. Must be 'group_admin' or 'group_member'" });
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!req.user?.isAdmin && !(req.user?.isGroupAdmin && req.user?.adminGroupId === groupId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const inviteCode = generateInviteCode();
    
    const updateData: any = {};
    if (type === "group_admin") {
      updateData.groupAdminInviteCode = inviteCode;
    } else {
      updateData.groupMemberInviteCode = inviteCode;
    }

    const [updatedGroup] = await db
      .update(groups)
      .set(updateData)
      .where(eq(groups.id, groupId))
      .returning();

    const responseCode = type === "group_admin" 
      ? updatedGroup.groupAdminInviteCode 
      : updatedGroup.groupMemberInviteCode;

    res.json({ inviteCode: responseCode });
  } catch (error) {
    logger.error("Error generating group invite code:", error);
    res.status(500).json({ message: "Failed to generate invite code" });
  }
});

inviteCodeRouter.post("/api/teams/:teamId/generate-invite-codes", authenticate, async (req: Request, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    if (isNaN(teamId)) {
      return res.status(400).json({ message: "Invalid team ID" });
    }

    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, team.groupId)).limit(1);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    if (!req.user?.isAdmin && !(req.user?.isGroupAdmin && req.user?.adminGroupId === team.groupId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const teamAdminCode = generateInviteCode();
    const teamMemberCode = generateInviteCode();
    
    const [updatedTeam] = await db
      .update(teams)
      .set({ 
        teamAdminInviteCode: teamAdminCode,
        teamMemberInviteCode: teamMemberCode 
      })
      .where(eq(teams.id, teamId))
      .returning();

    res.json({ 
      teamAdminInviteCode: updatedTeam.teamAdminInviteCode,
      teamMemberInviteCode: updatedTeam.teamMemberInviteCode 
    });
  } catch (error) {
    logger.error("Error generating team invite codes:", error);
    res.status(500).json({ message: "Failed to generate invite codes" });
  }
});

inviteCodeRouter.post("/api/redeem-invite-code", authenticate, async (req: Request, res: Response) => {
  try {
    const { inviteCode, tzOffset } = req.body;
    const timezoneOffset = parseInt(tzOffset) || 0; // Get timezone offset in minutes
    
    if (!inviteCode || typeof inviteCode !== "string") {
      return res.status(400).json({ message: "Invalid invite code" });
    }

    const userId = req.user!.id;

    const [groupAdmin] = await db
      .select()
      .from(groups)
      .where(eq(groups.groupAdminInviteCode, inviteCode))
      .limit(1);

    if (groupAdmin) {
      if (req.user!.teamId) {
        return res.status(400).json({ message: "You must leave your current team before becoming a Group Admin" });
      }

      await db
        .update(users)
        .set({ 
          isGroupAdmin: true,
          adminGroupId: groupAdmin.id,
          teamId: null
        })
        .where(eq(users.id, userId));

      return res.json({ 
        success: true, 
        role: "Group Admin",
        groupId: groupAdmin.id,
        groupName: groupAdmin.name 
      });
    }

    const [teamAdmin] = await db
      .select()
      .from(teams)
      .where(eq(teams.teamAdminInviteCode, inviteCode))
      .limit(1);

    if (teamAdmin) {
      const [group] = await db.select().from(groups).where(eq(groups.id, teamAdmin.groupId)).limit(1);
      
      if (req.user!.isGroupAdmin) {
        return res.status(400).json({ message: "You cannot join a team as a Team Lead while you are a Group Admin" });
      }

      const teamMemberCount = await db
        .select()
        .from(users)
        .where(eq(users.teamId, teamAdmin.id));

      if (teamMemberCount.length >= (teamAdmin.maxSize || 6)) {
        return res.status(400).json({ message: "This team is full" });
      }

      const now = new Date();
      
      // Determine program start date with cascading logic: Group → Team → next Monday
      let userProgramStartDate: Date;
      
      // Check if group has a program start date
      if (group?.programStartDate) {
        const groupStartDate = new Date(group.programStartDate);
        if (groupStartDate > now) {
          userProgramStartDate = groupStartDate;
        } else if (teamAdmin.programStartDate) {
          // Group date has passed, check team date
          const teamStartDate = new Date(teamAdmin.programStartDate);
          if (teamStartDate > now) {
            userProgramStartDate = teamStartDate;
          } else {
            userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
          }
        } else {
          userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
        }
      } else if (teamAdmin.programStartDate) {
        // No group date, check team date
        const teamStartDate = new Date(teamAdmin.programStartDate);
        if (teamStartDate > now) {
          userProgramStartDate = teamStartDate;
        } else {
          userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
        }
      } else {
        // No group or team date, calculate next Monday in user's timezone
        userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
      }
      
      const updateData: any = { 
        isTeamLead: true,
        teamId: teamAdmin.id,
        teamJoinedAt: now,
        programStartDate: userProgramStartDate
      };
      
      await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));

      return res.json({ 
        success: true, 
        role: "Team Lead",
        teamId: teamAdmin.id,
        teamName: teamAdmin.name,
        groupName: group?.name,
        displayName: teamAdmin.name // Use team name for display
      });
    }

    const [teamMember] = await db
      .select()
      .from(teams)
      .where(eq(teams.teamMemberInviteCode, inviteCode))
      .limit(1);

    if (teamMember) {
      const [group] = await db.select().from(groups).where(eq(groups.id, teamMember.groupId)).limit(1);
      
      if (req.user!.isGroupAdmin) {
        return res.status(400).json({ message: "You cannot join a team as a Team Member while you are a Group Admin" });
      }

      const teamMemberCount = await db
        .select()
        .from(users)
        .where(eq(users.teamId, teamMember.id));

      if (teamMemberCount.length >= (teamMember.maxSize || 6)) {
        return res.status(400).json({ message: "This team is full" });
      }

      const now = new Date();
      
      // Determine program start date with cascading logic: Group → Team → next Monday
      let userProgramStartDate: Date;
      
      // Check if group has a program start date
      if (group?.programStartDate) {
        const groupStartDate = new Date(group.programStartDate);
        if (groupStartDate > now) {
          userProgramStartDate = groupStartDate;
        } else if (teamMember.programStartDate) {
          // Group date has passed, check team date
          const teamStartDate = new Date(teamMember.programStartDate);
          if (teamStartDate > now) {
            userProgramStartDate = teamStartDate;
          } else {
            userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
          }
        } else {
          userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
        }
      } else if (teamMember.programStartDate) {
        // No group date, check team date
        const teamStartDate = new Date(teamMember.programStartDate);
        if (teamStartDate > now) {
          userProgramStartDate = teamStartDate;
        } else {
          userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
        }
      } else {
        // No group or team date, calculate next Monday in user's timezone
        userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
      }
      
      const updateData: any = { 
        teamId: teamMember.id,
        teamJoinedAt: now,
        isTeamLead: false,
        programStartDate: userProgramStartDate
      };
      
      await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));

      return res.json({ 
        success: true, 
        role: "Team Member",
        teamId: teamMember.id,
        teamName: teamMember.name,
        groupName: group?.name,
        displayName: teamMember.name // Use team name for display
      });
    }

    // Check for group member invite code
    const [groupMember] = await db
      .select()
      .from(groups)
      .where(eq(groups.groupMemberInviteCode, inviteCode))
      .limit(1);

    if (groupMember) {
      if (req.user!.teamId) {
        return res.status(400).json({ message: "You must leave your current team before joining a new group" });
      }

      const now = new Date();
      
      // Determine program start date based on group's program start date or next Monday
      let userProgramStartDate: Date;
      
      if (groupMember.programStartDate) {
        const groupStartDate = new Date(groupMember.programStartDate);
        if (groupStartDate > now) {
          userProgramStartDate = groupStartDate;
        } else {
          userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
        }
      } else {
        userProgramStartDate = getNextMondayLocal(now, timezoneOffset);
      }

      await db
        .update(users)
        .set({ 
          isGroupAdmin: false,
          adminGroupId: groupMember.id,
          teamId: null,
          programStartDate: userProgramStartDate
        })
        .where(eq(users.id, userId));

      return res.json({ 
        success: true, 
        role: "Group Member",
        groupId: groupMember.id,
        groupName: groupMember.name 
      });
    }

    return res.status(404).json({ message: "Invalid invite code" });
  } catch (error) {
    logger.error("Error redeeming invite code:", error);
    res.status(500).json({ message: "Failed to redeem invite code" });
  }
});
