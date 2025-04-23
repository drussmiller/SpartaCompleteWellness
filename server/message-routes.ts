/**
 * Message routes handler
 * This file contains all message-related routes for the Sparta application
 * It should be imported and used in routes.ts to replace the duplicate routes
 */

import express, { Request, Response } from 'express';
import { authenticate } from './auth';
import multer from 'multer';
import { db } from './db';
import { messages, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

// Configure upload middleware
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Create a router for messages
export const messageRouter = express.Router();

// Create new message
messageRouter.post("/api/messages", authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const { content, recipientId, is_video } = req.body;

    // Validate recipient exists
    const [recipient] = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(recipientId)))
      .limit(1);

    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }
    
    let isVideoFlag = false;
    
    // Check if is_video flag is present and convert to boolean
    if (is_video === 'true' || is_video === true) {
      isVideoFlag = true;
    }

    // Create message
    const [message] = await db
      .insert(messages)
      .values({
        senderId: req.user.id,
        recipientId: parseInt(recipientId),
        content: content || null,
        imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
        isRead: false,
        is_video: isVideoFlag,
      })
      .returning();

    // Log and respond
    logger.info(`Message sent from user ${req.user.id} to ${recipientId}`);
    return res.status(201).json(message);
  } catch (error) {
    logger.error("Error sending message:", error);
    return res.status(500).json({ message: "Failed to send message" });
  }
});

// Get messages between users
messageRouter.get("/api/messages/:userId", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const otherUserId = parseInt(req.params.userId);

    // Get messages between these two users
    const messageList = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        recipientId: messages.recipientId,
        content: messages.content,
        imageUrl: messages.imageUrl,
        isRead: messages.isRead,
        createdAt: messages.createdAt,
        is_video: messages.is_video,
        sender: {
          id: users.id,
          username: users.username,
          preferredName: users.preferredName,
          avatar: users.avatar,
        },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        // Either messages sent by current user to the other user
        // or messages sent by the other user to the current user
        eq(
          true,
          eq(messages.senderId, req.user.id) && eq(messages.recipientId, otherUserId) ||
          eq(messages.senderId, otherUserId) && eq(messages.recipientId, req.user.id)
        )
      )
      .orderBy(messages.createdAt);

    return res.json(messageList);
  } catch (error) {
    logger.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// Get unread message count
messageRouter.get("/api/messages/unread/count", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Count unread messages for this user
    const [result] = await db
      .select({
        count: db.fn.count(messages.id),
      })
      .from(messages)
      .where(
        eq(messages.recipientId, req.user.id),
        eq(messages.isRead, false)
      );

    const unreadCount = Number(result?.count || 0);
    return res.json({ unreadCount });
  } catch (error) {
    logger.error("Error counting unread messages:", error);
    return res.status(500).json({ message: "Failed to count unread messages" });
  }
});

// Mark messages as read
messageRouter.post("/api/messages/read", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    
    const { senderId } = req.body;
    
    if (!senderId) {
      return res.status(400).json({ message: "Sender ID is required" });
    }

    // Mark all messages from this sender as read
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        eq(messages.recipientId, req.user.id),
        eq(messages.senderId, parseInt(senderId)),
      );

    return res.json({ success: true });
  } catch (error) {
    logger.error("Error marking messages as read:", error);
    return res.status(500).json({ message: "Failed to mark messages as read" });
  }
});

// Get unread messages by sender
messageRouter.get("/api/messages/unread/by-sender", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Get count of unread messages grouped by sender
    const result = await db
      .select({
        senderId: messages.senderId,
        count: db.fn.count(messages.id),
        sender: {
          id: users.id,
          username: users.username,
          preferredName: users.preferredName,
          avatar: users.avatar,
        },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        eq(messages.recipientId, req.user.id),
        eq(messages.isRead, false)
      )
      .groupBy(messages.senderId, users.id, users.username, users.preferredName, users.avatar);

    return res.json(result);
  } catch (error) {
    logger.error("Error fetching unread messages by sender:", error);
    return res.status(500).json({ message: "Failed to fetch unread messages by sender" });
  }
});