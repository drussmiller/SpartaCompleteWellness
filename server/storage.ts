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
  messages,
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

  async getUserByPreferredName(preferredName: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.preferredName}) = LOWER(${preferredName})`)
        .limit(1);
      return result[0] || null;
    } catch (error) {
      logger.error(`Failed to get user by preferred name ${preferredName}: ${error}`);
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
          thumbnailUrl: posts.thumbnailUrl, // Added thumbnailUrl for video thumbnails
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
      
      // NOTE: Media file cleanup is now handled in routes.ts BEFORE calling this function
      // This ensures proper handling of HLS videos, thumbnails, and regular media files
      
      // Delete the post record from the database
      await db.delete(posts).where(eq(posts.id, id));
      logger.info(`Deleted post ${id} from database`);
      
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
      const { spartaObjectStorage } = await import('./sparta-object-storage-final');

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

        // Delete all messages sent by this user
        await tx
          .delete(messages)
          .where(eq(messages.senderId, userId));

        // Delete all messages received by this user
        await tx
          .delete(messages)
          .where(eq(messages.recipientId, userId));

        // Finally delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });

      // After the transaction completes successfully, clean up the media files
      const { objectStorageClient } = await import('./replit_integrations/object_storage/objectStorage');
      const storageBucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || '';
      const storageBucket = objectStorageClient.bucket(storageBucketId);
      
      console.log(`[DELETE USER] Found ${postsWithMedia.length} posts with media for user ${userId}`);
      
      for (const post of postsWithMedia) {
        if (post.mediaUrl) {
          try {
            console.log(`[DELETE] Processing post ${post.id}: mediaUrl=${post.mediaUrl}, is_video=${post.is_video}`);
            
            // Check if this is an HLS video
            if (post.mediaUrl.includes('/api/hls/')) {
              // Extract base filename from HLS URL: /api/hls/{baseFilename}/playlist.m3u8
              const hlsMatch = post.mediaUrl.match(/\/api\/hls\/([^/]+)\//);
              if (hlsMatch) {
                const baseFilename = hlsMatch[1];
                logger.info(`Deleting HLS video for post ${post.id}: ${baseFilename}`);
                
                // Delete all files in the HLS directory
                const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
                try {
                  // List all files in the HLS directory
                  const [files] = await storageBucket.getFiles({ prefix: hlsPrefix });
                  logger.info(`Found ${files.length} HLS files to delete for ${baseFilename}`);
                  
                  // Delete each segment and playlist file
                  for (const fileItem of files) {
                    const fileKey = fileItem.name;
                    try {
                      await spartaObjectStorage.deleteFile(fileKey);
                      logger.debug(`Deleted HLS file: ${fileKey}`);
                    } catch (err) {
                      logger.error(`Failed to delete HLS file ${fileKey}: ${err}`);
                    }
                  }
                } catch (err) {
                  logger.error(`Failed to list HLS files for ${baseFilename}: ${err}`);
                }
                
                // Delete the HLS source thumbnail (e.g., 1764433282280-IMG_9504-hls-source.jpg)
                const hlsSourceThumbnail = `shared/uploads/${baseFilename}-hls-source.jpg`;
                try {
                  await spartaObjectStorage.deleteFile(hlsSourceThumbnail);
                  logger.debug(`Deleted HLS source thumbnail: ${hlsSourceThumbnail}`);
                } catch (err) {
                  logger.debug(`Could not delete HLS source thumbnail ${hlsSourceThumbnail}: ${err}`);
                }
              }
            } else {
              // Regular video or image - extract filename from URL
              let filename = '';
              
              // Handle different URL formats
              if (post.mediaUrl.includes('shared/uploads/')) {
                // Direct storage path: shared/uploads/filename.ext
                filename = post.mediaUrl.split('shared/uploads/')[1]?.split('?')[0] || '';
              } else if (post.mediaUrl.includes('/api/serve-file')) {
                // Serve file URL: /api/serve-file?filename=...
                const match = post.mediaUrl.match(/filename=([^&]+)/);
                filename = match ? match[1] : '';
              } else {
                // Fallback: just get the last part of the URL
                filename = post.mediaUrl.split('/').pop()?.split('?')[0] || '';
              }
              
              if (filename) {
                console.log(`[DELETE] Extracted filename for post ${post.id}: "${filename}"`);
                
                // Delete the main media file
                const mainFileKey = filename.startsWith('shared/uploads/') 
                  ? filename 
                  : `shared/uploads/${filename}`;
                  
                try {
                  await spartaObjectStorage.deleteFile(mainFileKey);
                  logger.debug(`Deleted media file for post ${post.id}: ${mainFileKey}`);
                } catch (err) {
                  logger.error(`Failed to delete main file ${mainFileKey}: ${err}`);
                }
                
                // If it's a video, delete the associated thumbnail
                console.log(`[DELETE] Checking if post ${post.id} is_video: ${post.is_video} (type: ${typeof post.is_video})`);
                if (post.is_video) {
                  // Get base filename without extension and without 'shared/uploads/' prefix
                  let baseFilename = filename.replace(/\.(mp4|mov|avi|mkv|webm|mpg|mpeg)$/i, '');
                  // Remove 'shared/uploads/' prefix if present to avoid duplication
                  baseFilename = baseFilename.replace(/^shared\/uploads\//, '');
                  
                  console.log(`[DELETE] Base filename for thumbnails (post ${post.id}): "${baseFilename}"`);
                  
                  // Try multiple thumbnail naming conventions
                  const thumbnailVariations = [
                    `shared/uploads/${baseFilename}.poster.jpg`,  // Primary format used by video uploads
                    `shared/uploads/${baseFilename}.jpg`,         // Fallback format
                    `shared/uploads/${baseFilename}.jpeg`,        // Alternative extension
                    `shared/uploads/thumb-${baseFilename}.jpg`,   // Old naming convention
                  ];
                  
                  console.log(`[DELETE] Trying ${thumbnailVariations.length} thumbnail variations for post ${post.id}:`, thumbnailVariations);
                  for (const thumbnailKey of thumbnailVariations) {
                    try {
                      console.log(`[DELETE] Attempting to delete thumbnail: ${thumbnailKey}`);
                      await spartaObjectStorage.deleteFile(thumbnailKey);
                      console.log(`[DELETE] ✓ Successfully deleted video thumbnail for post ${post.id}: ${thumbnailKey}`);
                    } catch (err) {
                      console.log(`[DELETE] ✗ Could not delete thumbnail ${thumbnailKey}: ${err}`);
                    }
                  }
                } else {
                  console.log(`[DELETE] Skipping thumbnail deletion for post ${post.id} - not a video`);
                }
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
          thumbnailUrl: posts.thumbnailUrl, // Added thumbnailUrl for video thumbnails
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
      // Require userId and parentId, but allow empty content if media is provided
      if (!data.userId || !data.parentId) {
        throw new Error("Missing required fields for comment");
      }
      // Validate that either content or media is provided
      if (!data.content && !data.mediaUrl) {
        throw new Error("Comment must have either text content or media");
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
          thumbnailUrl: data.thumbnailUrl || null, // Added thumbnailUrl field for video thumbnails
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