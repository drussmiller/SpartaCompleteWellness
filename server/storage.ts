import { db } from "./db";
import { eq, and, desc, sql, gte, lte, or, isNull } from "drizzle-orm";
import {
  posts,
  teams,
  groups,
  organizations,
  users,
  activities,
  reactions,
  notifications,
  measurements,
  workoutVideos,
  workoutTypes,
  type Post,
  type Team,
  type Group,
  type Organization,
  type User,
  type Activity,
  type Reaction,
  type Notification,
  type Measurement,
  type WorkoutVideo,
  type WorkoutType,
  type InsertTeam,
  type InsertGroup,
  type InsertOrganization,
  type InsertWorkoutType
} from "@shared/schema";
import { logger } from "./logger";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPgSimple(session);

// Storage adapter for database operations
export const storage = {
  // Teams
  async getTeams(): Promise<Team[]> {
    try {
      return await db.select().from(teams);
    } catch (error) {
      logger.error(`Failed to get teams: ${error}`);
      throw error;
    }
  },

  // Users
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${username})`)
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by username ${username}: ${error}`);
      throw error;
    }
  },

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = LOWER(${email})`)
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by email ${email}: ${error}`);
      throw error;
    }
  },
  async getUser(id: number): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user ${id}: ${error}`);
      throw error;
    }
  },

  async getAllUsers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      logger.error(`Failed to get all users: ${error}`);
      throw error;
    }
  },

  async getAdminUsers(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.isAdmin, true));
    } catch (error) {
      logger.error(`Failed to get admin users: ${error}`);
      throw error;
    }
  },

  async createUser(data: Omit<User, "id" | "createdAt">): Promise<User> {
    try {
      const avatarColors = [
        '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
        '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
        '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
        '#EC4899', '#F43F5E'
      ];
      const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
      
      const [user] = await db
        .insert(users)
        .values({ ...data, avatarColor: randomColor, createdAt: new Date() })
        .returning();
      return user;
    } catch (error) {
      logger.error(`Failed to create user: ${error}`);
      throw error;
    }
  },

  async updateUser(id: number, data: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set(data)
        .where(eq(users.id, id))
        .returning();
      return user;
    } catch (error) {
      logger.error(`Failed to update user ${id}: ${error}`);
      throw error;
    }
  },

  // Notifications
  async createNotification(data: Omit<Notification, "id">): Promise<Notification> {
    try {
      logger.debug("Creating notification:", data);
      const [notification] = await db
        .insert(notifications)
        .values({
          userId: data.userId,
          title: data.title,
          message: data.message,
          read: data.read ?? false,
          createdAt: new Date()
        })
        .returning();
      logger.debug("Notification created successfully:", notification.id);
      return notification;
    } catch (error) {
      logger.error(`Failed to create notification: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },

  async getNotifications(userId: number): Promise<Notification[]> {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
    } catch (error) {
      logger.error(`Failed to get notifications for user ${userId}: ${error}`);
      throw error;
    }
  },

  async markNotificationAsRead(id: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id));
    } catch (error) {
      logger.error(`Failed to mark notification ${id} as read: ${error}`);
      throw error;
    }
  },

  // Activities
  async getActivities(week?: number, day?: number, activityTypeId?: number): Promise<Activity[]> {
    try {
      let query = db.select().from(activities);
      const conditions = [];

      if (week !== undefined) {
        conditions.push(eq(activities.week, week));
      }

      if (day !== undefined) {
        conditions.push(eq(activities.day, day));
      }

      if (activityTypeId !== undefined) {
        conditions.push(eq(activities.activityTypeId, activityTypeId));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return await query.orderBy(activities.week, activities.day);
    } catch (error) {
      logger.error(`Failed to get activities: ${error}`);
      throw error;
    }
  },

  async getActivitiesForWeeks(weekNumbers: number[], activityTypeId?: number): Promise<Activity[]> {
    try {
      if (weekNumbers.length === 0) {
        return [];
      }

      const conditions = [
        or(...weekNumbers.map(week => eq(activities.week, week)))
      ];

      if (activityTypeId !== undefined) {
        conditions.push(eq(activities.activityTypeId, activityTypeId));
      }

      const query = db.select().from(activities).where(
        and(...conditions)
      );

      return await query.orderBy(activities.week, activities.day);
    } catch (error) {
      logger.error(`Failed to get activities for weeks: ${error}`);
      throw error;
    }
  },

  async createActivity(data: Partial<Activity>): Promise<Activity> {
    try {
      const [activity] = await db.insert(activities).values(data).returning();
      return activity;
    } catch (error) {
      logger.error(`Failed to create activity: ${error}`);
      throw error;
    }
  },

  async deleteActivity(id: number): Promise<void> {
    try {
      await db.delete(activities).where(eq(activities.id, id));
    } catch (error) {
      logger.error(`Failed to delete activity ${id}: ${error}`);
      throw error;
    }
  },

  // Posts
  async getAllPosts(page: number = 1, limit: number = 10): Promise<Post[]> {
    try {
      logger.debug("Getting paginated posts");
      // Get paginated posts with minimal author information
      const result = await db
        .select({
          id: posts.id,
          userId: posts.userId,
          type: posts.type,
          content: posts.content,
          mediaUrl: posts.mediaUrl, // Updated to mediaUrl to match frontend expectations
          is_video: posts.is_video, // Added is_video field
          points: posts.points,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl,
            preferredName: users.preferredName,
            teamId: users.teamId
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(isNull(posts.parentId))
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      logger.debug(`Retrieved ${result.length} posts for page ${page}`);
      return result;
    } catch (error) {
      logger.error(`Failed to get posts: ${error}`);
      throw error;
    }
  },

  async getPosts(userId?: number): Promise<Post[]> {
    try {
      if (userId) {
        return await db
          .select()
          .from(posts)
          .where(eq(posts.userId, userId))
          .orderBy(desc(posts.createdAt));
      } else {
        return await db
          .select()
          .from(posts)
          .orderBy(desc(posts.createdAt));
      }
    } catch (error) {
      logger.error(`Failed to get posts: ${error}`);
      throw error;
    }
  },

  async createPost(data: Partial<Post>): Promise<Post> {
    try {
      logger.debug("Creating post with data:", data);
      const [post] = await db
        .insert(posts)
        .values({
          userId: data.userId,
          type: data.type || "comment",
          content: data.content,
          mediaUrl: data.mediaUrl, // Updated field name
          is_video: data.is_video || false, // Added is_video field with default false
          parentId: data.parentId || null,
          depth: data.depth || 0,
          points: data.points || 1,
          createdAt: data.createdAt || new Date()
        })
        .returning();
      logger.debug("Post created successfully:", post.id);
      return post;
    } catch (error) {
      logger.error(`Failed to create post: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },

  async deletePost(id: number): Promise<void> {
    try {
      logger.info(`Starting deletion of post ${id}`);
      
      // First, get the post to check if it has media that needs to be deleted
      const postToDelete = await db
        .select({
          id: posts.id,
          mediaUrl: posts.mediaUrl,
          is_video: posts.is_video
        })
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
      
      logger.debug(`Post data for deletion:`, postToDelete[0]);
      
      // Delete the post record from the database
      await db.delete(posts).where(eq(posts.id, id));
      logger.info(`Deleted post ${id} from database`);
      
      // If the post had media, delete the media files from Object Storage
      if (postToDelete.length > 0 && postToDelete[0].mediaUrl) {
        const mediaUrl = postToDelete[0].mediaUrl;
        const isVideo = postToDelete[0].is_video;
        
        logger.info(`Deleting media files for post ${id}, mediaUrl: ${mediaUrl}, isVideo: ${isVideo}`);
        
        try {
          // Import the SpartaObjectStorage utility
          const { spartaStorage } = await import('./sparta-object-storage');
          
          // Extract clean filename from mediaUrl
          let filename = '';
          if (mediaUrl.includes('filename=')) {
            // Handle serve-file URLs like /api/serve-file?filename=...
            const urlParams = new URLSearchParams(mediaUrl.split('?')[1]);
            filename = urlParams.get('filename') || '';
          } else {
            // Handle direct paths
            filename = mediaUrl.split('/').pop() || '';
          }
          
          logger.debug(`Extracted filename: ${filename}`);
          
          if (filename) {
            // Build the actual Object Storage path
            const filePath = `shared/uploads/${filename}`;
            
            // Delete the main media file
            try {
              await spartaStorage.deleteFile(filePath);
              logger.info(`Deleted main media file: ${filePath}`);
            } catch (err) {
              logger.warn(`Could not delete main media file ${filePath}: ${err}`);
            }
            
            // If it's a video, also delete the thumbnail
            if (isVideo) {
              // With the new compact naming, thumbnails have the same base name but .jpg extension
              const baseName = filename.substring(0, filename.lastIndexOf('.'));
              const thumbnailPath = `shared/uploads/${baseName}.jpg`;
              
              try {
                await spartaStorage.deleteFile(thumbnailPath);
                logger.info(`Deleted video thumbnail: ${thumbnailPath}`);
              } catch (err) {
                logger.debug(`Could not delete video thumbnail ${thumbnailPath}: ${err}`);
              }
            }
          }
        } catch (mediaError) {
          // Log but don't throw - we want to continue even if media deletion fails
          logger.error(`Error deleting media for post ${id}: ${mediaError}`);
        }
      }
      
      logger.info(`Successfully completed deletion of post ${id}`);
    } catch (error) {
      logger.error(`Failed to delete post ${id}: ${error}`);
      throw error;
    }
  },

  // Reactions
  async createReaction(data: { userId: number; postId: number; type: string }): Promise<Reaction> {
    try {
      const [reaction] = await db
        .insert(reactions)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return reaction;
    } catch (error) {
      logger.error(`Failed to create reaction: ${error}`);
      throw error;
    }
  },

  async deleteReaction(userId: number, postId: number, type: string): Promise<void> {
    try {
      await db
        .delete(reactions)
        .where(
          and(
            eq(reactions.userId, userId),
            eq(reactions.postId, postId),
            eq(reactions.type, type)
          )
        );
    } catch (error) {
      logger.error(`Failed to delete reaction: ${error}`);
      throw error;
    }
  },

  async getReactionsByPost(postId: number): Promise<Reaction[]> {
    try {
      return await db
        .select()
        .from(reactions)
        .where(eq(reactions.postId, postId));
    } catch (error) {
      logger.error(`Failed to get reactions for post ${postId}: ${error}`);
      throw error;
    }
  },
  // Delete a user and all their associated data
  async deleteUser(userId: number): Promise<void> {
    try {
      // Import the SpartaObjectStorage utility for media deletion
      const { spartaStorage } = await import('./sparta-object-storage');

      // First, get all posts by this user that have media to delete
      const postsWithMedia = await db
        .select({
          id: posts.id, 
          mediaUrl: posts.mediaUrl,
          is_video: posts.is_video
        })
        .from(posts)
        .where(
          and(
            eq(posts.userId, userId),
            sql`${posts.mediaUrl} IS NOT NULL`
          )
        );

      // Now delete everything in a transaction
      await db.transaction(async (tx) => {
        // Delete all reactions by this user
        await tx
          .delete(reactions)
          .where(eq(reactions.userId, userId));

        // Delete all comments by this user
        await tx
          .delete(posts)
          .where(and(
            eq(posts.userId, userId),
            sql`${posts.parentId} IS NOT NULL`
          ));

        // Delete all posts by this user
        await tx
          .delete(posts)
          .where(eq(posts.userId, userId));

        // Delete all notifications for this user
        await tx
          .delete(notifications)
          .where(eq(notifications.userId, userId));

        // Finally delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });

      // After the transaction completes successfully, clean up the media files
      for (const post of postsWithMedia) {
        if (post.mediaUrl) {
          try {
            // Delete the main media file
            await spartaStorage.deleteFile(post.mediaUrl);
            logger.debug(`Deleted media file for post ${post.id}: ${post.mediaUrl}`);

            // If it's a video, also try to delete associated files (poster, thumbnails)
            if (post.is_video) {
              // Delete the poster image if it exists
              const filename = post.mediaUrl.split('/').pop() || '';
              const baseName = filename.substring(0, filename.lastIndexOf('.'));
              const posterUrl = post.mediaUrl.replace(filename, `${baseName}.poster.jpg`);
              
              try {
                await spartaStorage.deleteFile(posterUrl);
                logger.debug(`Deleted poster image for post ${post.id}: ${posterUrl}`);
              } catch (err) {
                // Ignore errors for poster deletion - it might not exist
                logger.debug(`Could not delete poster image for post ${post.id}: ${posterUrl}`);
              }
              
              // Delete thumbnails (both formats - with and without thumb- prefix)
              const thumbPath = post.mediaUrl.replace('/uploads/', '/uploads/thumbnails/');
              const prefixedThumbPath = thumbPath.replace(filename, `thumb-${filename}`);
              
              try {
                await spartaStorage.deleteFile(thumbPath);
                logger.debug(`Deleted thumbnail for post ${post.id}: ${thumbPath}`);
              } catch (err) {
                // Ignore errors for thumbnail deletion - it might not exist
                logger.debug(`Could not delete thumbnail for post ${post.id}: ${thumbPath}`);
              }
              
              try {
                await spartaStorage.deleteFile(prefixedThumbPath);
                logger.debug(`Deleted prefixed thumbnail for post ${post.id}: ${prefixedThumbPath}`);
              } catch (err) {
                // Ignore errors for prefixed thumbnail deletion - it might not exist
                logger.debug(`Could not delete prefixed thumbnail for post ${post.id}: ${prefixedThumbPath}`);
              }
            }
          } catch (mediaError) {
            // Log but don't throw - we want to continue even if some media deletion fails
            logger.error(`Error deleting media for post ${post.id}: ${mediaError}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to delete user ${userId}: ${error}`);
      throw error;
    }
  },
  sessionStore: new PostgresSessionStore({
    pool,
    createTableIfMissing: true,
  }),
  async getPostComments(postId: number): Promise<(Post & { author: User })[]> {
    try {
      // Get all comments for this post with author information
      const result = await db
        .select({
          id: posts.id,
          userId: posts.userId,
          type: posts.type,
          content: posts.content,
          mediaUrl: posts.mediaUrl, // Updated to mediaUrl to match frontend expectations
          is_video: posts.is_video, // Added is_video field
          points: posts.points,
          createdAt: posts.createdAt,
          parentId: posts.parentId,
          depth: posts.depth,
          author: {
            id: users.id,
            username: users.username,
            imageUrl: users.imageUrl,
          }
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(
          or(
            eq(posts.parentId, postId),
            sql`${posts.id} IN (
              WITH RECURSIVE comment_tree AS (
                SELECT id FROM ${posts} WHERE parent_id = ${postId}
                UNION ALL
                SELECT p.id FROM ${posts} p
                INNER JOIN comment_tree ct ON p.parent_id = ct.id
              )
              SELECT id FROM comment_tree
            )`
          )
        )
        .orderBy(desc(posts.createdAt));

      // Log the result for debugging
      logger.debug(`Retrieved ${result.length} comments for post ${postId}`);
      
      return result;
    } catch (error) {
      logger.error(`Failed to get comments for post ${postId}: ${error}`);
      throw error;
    }
  },

  async createComment(data: Partial<Post>): Promise<Post> {
    try {
      logger.debug("Creating comment with data:", data);
      if (!data.userId || !data.content || !data.parentId) {
        throw new Error("Missing required fields for comment");
      }
      
      // Check for potentially problematic parent ID values (like JS timestamps)
      let safeParentId = data.parentId;
      
      // Handle potential integer overflow from JavaScript timestamps
      if (safeParentId && typeof safeParentId === 'number' && safeParentId > 2147483647) {
        // PostgreSQL integer type range is -2,147,483,648 to 2,147,483,647
        // If we have a JavaScript timestamp (13 digits), convert it to a safe integer
        const parentIdStr = String(safeParentId);
        if (parentIdStr.length > 10) {
          safeParentId = parseInt(parentIdStr.substring(0, 9));
          logger.debug(`Converted large parentId ${data.parentId} to safe value ${safeParentId}`);
        }
      }

      // Log the conversion for debugging
      if (safeParentId !== data.parentId) {
        logger.info(`Converted parentId from ${data.parentId} to ${safeParentId} to prevent integer overflow`);
      }

      const [comment] = await db
        .insert(posts)
        .values({
          userId: data.userId,
          type: "comment",
          content: data.content,
          parentId: safeParentId, // Use the safe parentId
          mediaUrl: data.mediaUrl || null, // Added mediaUrl field
          is_video: data.is_video || false, // Added is_video field with default false
          depth: data.depth || 0,
          points: data.points !== undefined ? data.points : 0, // Use provided points or default to 0
          createdAt: new Date()
        })
        .returning();
      logger.debug("Comment created successfully:", comment.id);
      return comment;
    } catch (error) {
      logger.error(`Failed to create comment: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  },
  async createTeam(data: InsertTeam): Promise<Team> {
    try {
      const [team] = await db.insert(teams).values(data).returning();
      return team;
    } catch (error) {
      logger.error('Database error creating team:', error);
      throw error;
    }
  },

  async updateTeam(id: number, data: Partial<Omit<Team, "id" | "createdAt">>): Promise<Team> {
    try {
      const [team] = await db
        .update(teams)
        .set(data)
        .where(eq(teams.id, id))
        .returning();
      return team;
    } catch (error) {
      logger.error('Database error updating team:', error);
      throw error;
    }
  },
  
  async deleteTeam(id: number): Promise<void> {
    try {
      await db.delete(teams).where(eq(teams.id, id));
    } catch (error) {
      logger.error(`Failed to delete team ${id}:`, error);
      throw error;
    }
  },

  async getTeamsByGroup(groupId: number): Promise<Team[]> {
    try {
      return await db.select().from(teams).where(eq(teams.groupId, groupId));
    } catch (error) {
      logger.error(`Failed to get teams for group ${groupId}:`, error);
      throw error;
    }
  },

  async getTeamMemberCount(teamId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.teamId, teamId));
      // Ensure we return a proper number, not a string
      return Number(result[0]?.count) || 0;
    } catch (error) {
      logger.error(`Failed to get team member count for team ${teamId}:`, error);
      throw error;
    }
  },

  // Group Admin operations
  async makeUserGroupAdmin(userId: number, groupId: number): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set({ 
          isGroupAdmin: true,
          adminGroupId: groupId 
        })
        .where(eq(users.id, userId))
        .returning();
      return user;
    } catch (error) {
      logger.error(`Failed to make user ${userId} group admin of group ${groupId}:`, error);
      throw error;
    }
  },

  async removeUserGroupAdmin(userId: number): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set({ 
          isGroupAdmin: false,
          adminGroupId: null 
        })
        .where(eq(users.id, userId))
        .returning();
      return user;
    } catch (error) {
      logger.error(`Failed to remove group admin status from user ${userId}:`, error);
      throw error;
    }
  },

  async getGroupAdmins(groupId: number): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(and(eq(users.isGroupAdmin, true), eq(users.adminGroupId, groupId)));
    } catch (error) {
      logger.error(`Failed to get group admins for group ${groupId}:`, error);
      throw error;
    }
  },

  async isUserGroupAdmin(userId: number, groupId: number): Promise<boolean> {
    try {
      const user = await db
        .select()
        .from(users)
        .where(and(
          eq(users.id, userId),
          eq(users.isGroupAdmin, true),
          eq(users.adminGroupId, groupId)
        ))
        .limit(1);
      return user.length > 0;
    } catch (error) {
      logger.error(`Failed to check if user ${userId} is group admin of group ${groupId}:`, error);
      throw error;
    }
  },
  
  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    try {
      return await db.select().from(organizations);
    } catch (error) {
      logger.error(`Failed to get organizations: ${error}`);
      throw error;
    }
  },

  async createOrganization(data: InsertOrganization): Promise<Organization> {
    try {
      const [organization] = await db
        .insert(organizations)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return organization;
    } catch (error) {
      logger.error(`Failed to create organization: ${error}`);
      throw error;
    }
  },

  async updateOrganization(id: number, data: Partial<Omit<Organization, "id" | "createdAt">>): Promise<Organization> {
    try {
      const [organization] = await db
        .update(organizations)
        .set(data)
        .where(eq(organizations.id, id))
        .returning();
      return organization;
    } catch (error) {
      logger.error('Database error updating organization:', error);
      throw error;
    }
  },

  async deleteOrganization(id: number): Promise<void> {
    try {
      await db.delete(organizations).where(eq(organizations.id, id));
    } catch (error) {
      logger.error(`Failed to delete organization ${id}: ${error}`);
      throw error;
    }
  },

  // Groups
  async getGroups(): Promise<Group[]> {
    try {
      return await db.select().from(groups);
    } catch (error) {
      logger.error(`Failed to get groups: ${error}`);
      throw error;
    }
  },

  async getGroupsByOrganization(organizationId: number): Promise<Group[]> {
    try {
      return await db.select().from(groups).where(eq(groups.organizationId, organizationId));
    } catch (error) {
      logger.error(`Failed to get groups for organization ${organizationId}: ${error}`);
      throw error;
    }
  },

  async createGroup(data: InsertGroup): Promise<Group> {
    try {
      const [group] = await db
        .insert(groups)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return group;
    } catch (error) {
      logger.error(`Failed to create group: ${error}`);
      throw error;
    }
  },

  async updateGroup(id: number, data: Partial<Omit<Group, "id" | "createdAt">>): Promise<Group> {
    try {
      const [group] = await db
        .update(groups)
        .set(data)
        .where(eq(groups.id, id))
        .returning();
      return group;
    } catch (error) {
      logger.error('Database error updating group:', error);
      throw error;
    }
  },

  async deleteGroup(id: number): Promise<void> {
    try {
      await db.delete(groups).where(eq(groups.id, id));
    } catch (error) {
      logger.error(`Failed to delete group ${id}: ${error}`);
      throw error;
    }
  },

  // Workout Types
  async getWorkoutTypes(): Promise<WorkoutType[]> {
    try {
      return await db.select().from(workoutTypes);
    } catch (error) {
      logger.error(`Failed to get workout types: ${error}`);
      throw error;
    }
  },

  async createWorkoutType(data: InsertWorkoutType): Promise<WorkoutType> {
    try {
      const [workoutType] = await db
        .insert(workoutTypes)
        .values({ ...data, createdAt: new Date() })
        .returning();
      return workoutType;
    } catch (error) {
      logger.error(`Failed to create workout type: ${error}`);
      throw error;
    }
  },

  async updateWorkoutType(id: number, data: Partial<Omit<WorkoutType, "id" | "createdAt">>): Promise<WorkoutType> {
    try {
      const [workoutType] = await db
        .update(workoutTypes)
        .set(data)
        .where(eq(workoutTypes.id, id))
        .returning();
      return workoutType;
    } catch (error) {
      logger.error('Database error updating workout type:', error);
      throw error;
    }
  },

  async deleteWorkoutType(id: number): Promise<void> {
    try {
      await db.delete(workoutTypes).where(eq(workoutTypes.id, id));
    } catch (error) {
      logger.error(`Failed to delete workout type ${id}: ${error}`);
      throw error;
    }
  }
};