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

// Get unread message count - MORE SPECIFIC ROUTE FIRST
messageRouter.get("/api/messages/unread/count", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Count unread messages for this user
    const result = await db.select().from(messages)
      .where(eq(messages.recipientId, req.user.id))
      .where(eq(messages.isRead, false));

    const unreadCount = result.length;
    console.log(`Found ${unreadCount} unread messages for user ${req.user.id}`);
    return res.json({ unreadCount });
  } catch (error) {
    console.error("DETAILED ERROR counting unread messages:", error);
    logger.error("Error counting unread messages:", error);
    return res.status(500).json({ message: "Failed to count unread messages" });
  }
});

// Get unread messages by sender - MORE SPECIFIC ROUTE SECOND
messageRouter.get("/api/messages/unread/by-sender", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    console.log(`Getting unread messages by sender for user ${req.user.id}`);
    
    // First, get all unread messages
    const unreadMessages = await db
      .select({
        senderId: messages.senderId,
      })
      .from(messages)
      .where(eq(messages.recipientId, req.user.id))
      .where(eq(messages.isRead, false));
    
    // Group by sender
    const senderCounts = {};
    for (const msg of unreadMessages) {
      senderCounts[msg.senderId] = (senderCounts[msg.senderId] || 0) + 1;
    }
    
    // Get sender details
    const result = [];
    for (const senderId of Object.keys(senderCounts)) {
      const [sender] = await db
        .select({
          id: users.id,
          username: users.username,
          preferredName: users.preferredName,
          imageUrl: users.imageUrl,
        })
        .from(users)
        .where(eq(users.id, parseInt(senderId)));
        
      if (sender) {
        result.push({
          senderId: parseInt(senderId),
          count: senderCounts[senderId],
          sender
        });
      }
    }
    
    console.log(`Found ${result.length} senders with unread messages`);
    return res.json(result);
  } catch (error) {
    console.error("DETAILED ERROR fetching unread messages by sender:", error);
    logger.error("Error fetching unread messages by sender:", error);
    return res.status(500).json({ message: "Failed to fetch unread messages by sender" });
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

// Get messages between users - GENERIC ROUTE LAST
messageRouter.get("/api/messages/:userId", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const otherUserId = parseInt(req.params.userId);
    
    // Added detailed debug logging
    console.log(`Fetching messages between user ${req.user.id} and user ${otherUserId}`);
    
    // Validate the userId is a valid number
    if (isNaN(otherUserId)) {
      console.log(`Invalid userId: ${req.params.userId} is not a number`);
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Get all messages between these two users
    const rawMessages = await db
      .select()
      .from(messages)
      .where(
        // Either messages sent by current user to the other user
        // or messages sent by the other user to the current user
        (builder) => 
          builder
            .where((subBuilder) => 
              subBuilder
                .where(eq(messages.senderId, req.user.id))
                .where(eq(messages.recipientId, otherUserId))
            )
            .orWhere((subBuilder) => 
              subBuilder
                .where(eq(messages.senderId, otherUserId))
                .where(eq(messages.recipientId, req.user.id))
            )
      )
      .orderBy(messages.createdAt);
    
    // Get sender details for each message
    const messageList = [];
    for (const msg of rawMessages) {
      // Check if the imageUrl ends with common video extensions to add is_video flag
      const isVideo = msg.imageUrl ? 
        /\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i.test(msg.imageUrl) : 
        false;
      
      const [senderInfo] = await db
        .select({
          id: users.id,
          username: users.username,
          preferredName: users.preferredName,
          imageUrl: users.imageUrl,
        })
        .from(users)
        .where(eq(users.id, msg.senderId));
        
      messageList.push({
        ...msg,
        is_video: isVideo,
        sender: senderInfo
      });
    }
    
    console.log(`Found ${messageList.length} messages`);
    return res.json(messageList);
  } catch (error) {
    console.error("DETAILED ERROR fetching messages:", error);
    logger.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});