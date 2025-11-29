/**
 * Message routes handler
 * This file contains all message-related routes for the Sparta application
 * It should be imported and used in routes.ts to replace the duplicate routes
 */

import express, { Request, Response } from 'express';
import { authenticate } from './auth';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { db } from './db';
import { messages, users } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { logger } from './logger';
import { spartaObjectStorage } from './sparta-object-storage-final';

// Create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure improved upload middleware to handle videos properly
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in uploads directory
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate compact unique filename
    const now = Date.now();
    const shortId = Math.random().toString(36).substring(2, 7); // 5 chars
    const shortTime = (now % 100000000).toString(36); // Last 8 digits in base36 (~5 chars)
    
    // Check if it's a video based on is_video flag in the request or file mimetype
    let isVideo = false;
    
    // Check from formdata
    if (req.body && req.body.is_video === 'true') {
      isVideo = true;
    }
    
    // Also check based on mimetype or file extension
    const videoMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/mov'];
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (videoMimeTypes.includes(file.mimetype) || videoExtensions.includes(fileExt)) {
      isVideo = true;
    }
    
    console.log('Message file upload info:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      isVideo,
      isVideoFromFormData: req.body?.is_video === 'true',
      fileExt
    });
    
    // Use appropriate extension with shorter filename
    if (isVideo) {
      // For videos, preserve the original extension or default to .mp4
      const fileExtension = fileExt || '.mp4';
      cb(null, `${shortTime}${shortId}-msg${fileExtension}`);
    } else {
      // For images, determine extension based on MIME type first, then filename
      let extension = '.jpg'; // default
      
      // Map MIME types to extensions
      const mimeToExt = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg', 
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/bmp': '.bmp',
        'image/tiff': '.tiff'
      };
      
      // Use MIME type if available and recognized
      if (file.mimetype && mimeToExt[file.mimetype]) {
        extension = mimeToExt[file.mimetype];
      } else {
        // Fall back to original filename extension if MIME type not recognized
        const origExt = path.extname(file.originalname);
        if (origExt) {
          extension = origExt.toLowerCase();
        }
      }
      
      cb(null, `${shortTime}${shortId}-msg${extension}`);
    }
  }
});

const upload = multer({ storage });

// Create a router for messages
export const messageRouter = express.Router();

// Create new message
messageRouter.post("/api/messages", authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    // Check if this is a JSON request with chunked upload data
    const contentType = req.headers['content-type'] || '';
    const isJsonRequest = contentType.includes('application/json');
    
    // Handle chunked upload (pre-uploaded video via HLS conversion)
    if (isJsonRequest && req.body.chunkedUploadMediaUrl) {
      console.log('Processing message with chunked upload result:', req.body);
      
      const { content, recipientId, chunkedUploadMediaUrl, chunkedUploadThumbnailUrl, is_video } = req.body;
      
      // Validate recipient exists
      const [recipient] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseInt(recipientId)))
        .limit(1);

      if (!recipient) {
        return res.status(404).json({ message: "Recipient not found" });
      }
      
      // Create message with pre-uploaded media URLs
      const [message] = await db
        .insert(messages)
        .values({
          senderId: req.user.id,
          recipientId: parseInt(recipientId),
          content: content || null,
          imageUrl: chunkedUploadMediaUrl, // HLS playlist or video URL
          posterUrl: chunkedUploadThumbnailUrl || null, // Video thumbnail
          isRead: false,
          is_video: is_video === true || is_video === 'true',
        })
        .returning();

      logger.info(`Message sent with chunked upload from user ${req.user.id} to ${recipientId} (mediaUrl: ${chunkedUploadMediaUrl})`);
      return res.status(201).json(message);
    }

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

    // If we received a video_extension parameter, this is definitely a video
    const videoExtension = req.body.video_extension;
    if (videoExtension) {
      isVideoFlag = true;
      console.log(`Received explicit video_extension parameter: ${videoExtension}`);
    }

    let mediaUrl = null;
    
    // Process file if present using SpartaObjectStorage
    if (req.file) {
      try {
        console.log('Processing message media file:', {
          filename: req.file.filename,
          originalname: req.file.originalname,
          path: req.file.path,
          mimetype: req.file.mimetype,
          isVideo: isVideoFlag,
          videoExtension
        });
        
        // Determine if this is a video based on multiple indicators
        const isVideoMimetype = req.file.mimetype.startsWith('video/');
        const isVideoExtension = req.file.originalname.toLowerCase().endsWith('.mov') || 
                               req.file.originalname.toLowerCase().endsWith('.mp4') ||
                               req.file.originalname.toLowerCase().endsWith('.webm') ||
                               req.file.originalname.toLowerCase().endsWith('.avi') ||
                               req.file.originalname.toLowerCase().endsWith('.mkv') ||
                               (typeof videoExtension === 'string' && videoExtension.length > 0);
        
        // Final video determination - use the flag from the form data or the file characteristics
        const isVideo = isVideoFlag || isVideoMimetype || isVideoExtension;
        
        // If this is a video but the MIME type doesn't reflect it, fix the MIME type
        let mimeType = req.file.mimetype;
        if (isVideo && !isVideoMimetype) {
          if (videoExtension === 'mov' || req.file.originalname.toLowerCase().endsWith('.mov')) {
            mimeType = 'video/quicktime';
            console.log('Correcting MIME type to video/quicktime for MOV file');
          } else if (videoExtension === 'mp4' || req.file.originalname.toLowerCase().endsWith('.mp4')) {
            mimeType = 'video/mp4';
            console.log('Correcting MIME type to video/mp4 for MP4 file');
          } else {
            mimeType = 'video/mp4'; // Default to mp4 if we can't determine the type
            console.log('Using default video/mp4 MIME type for unknown video format');
          }
        }
        
        logger.info(`Processing message media file with Object Storage: ${req.file.originalname}, type: ${mimeType}, isVideo: ${isVideo}`);
        
        // Store the file using Object Storage only
        const fileInfo = await spartaObjectStorage.storeFile(
          req.file.path, // Use the file path from disk storage multer
          req.file.filename, // Use multer-generated filename with correct extension
          mimeType,
          isVideo // Pass the isVideo flag to ensure proper handling
        );
        
        // Store the full Object Storage key for proper URL construction - same as comments
        if (fileInfo && fileInfo.filename) {
          mediaUrl = `shared/uploads/${fileInfo.filename}`;
          
          // Store the thumbnail URL if it was generated for videos
          if (isVideo && fileInfo.thumbnailUrl) {
            req.body.posterUrl = fileInfo.thumbnailUrl;
            console.log(`Video thumbnail generated:`, { posterUrl: fileInfo.thumbnailUrl });
          }
          
          console.log(`Stored message media file with full path:`, { url: mediaUrl, isVideo });
        } else {
          console.warn('Invalid fileInfo returned from Object Storage:', fileInfo);
          mediaUrl = null;
        }
        console.log(`Stored message media file:`, { url: mediaUrl, isVideo, posterUrl: req.body.posterUrl, originalFileInfo: fileInfo });
      } catch (fileError) {
        console.error('Error processing media file for message:', fileError);
        logger.error('Error processing media file for message:', fileError);
        // Set mediaUrl to null on error instead of leaving it undefined
        mediaUrl = null;
      }
    }

    // Create message with the properly processed media URL
    const [message] = await db
      .insert(messages)
      .values({
        senderId: req.user.id,
        recipientId: parseInt(recipientId),
        content: content || null,
        imageUrl: mediaUrl, // Use the full Object Storage path like comments do
        posterUrl: req.body.posterUrl || null, // Store the video thumbnail URL
        isRead: false,
        is_video: isVideoFlag,
      })
      .returning();

    // Log and respond
    logger.info(`Message sent from user ${req.user.id} to ${recipientId} (hasMedia: ${!!mediaUrl}, isVideo: ${isVideoFlag})`);
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
    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.recipientId, req.user.id),
          eq(messages.isRead, false)
        )
      );

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
      .where(
        and(
          eq(messages.recipientId, req.user.id),
          eq(messages.isRead, false)
        )
      );
    
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
        and(
          eq(messages.recipientId, req.user.id),
          eq(messages.senderId, parseInt(senderId))
        )
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
    if (!req.user) {
      console.log('Unauthorized request to get messages - no user in request');
      return res.status(401).json({ message: "Unauthorized" });
    }

    const otherUserId = parseInt(req.params.userId);
    
    // Added detailed debug logging
    console.log(`Fetching messages between user ${req.user.id} and user ${otherUserId}`);
    
    // Validate the userId is a valid number
    if (isNaN(otherUserId)) {
      console.log(`Invalid userId: ${req.params.userId} is not a number`);
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Get all messages between these two users
    const messageQuery = db
      .select()
      .from(messages);
    
    console.log(`Building query for messages where: 
      (senderId=${req.user.id} AND recipientId=${otherUserId}) OR 
      (senderId=${otherUserId} AND recipientId=${req.user.id})`);
    
    // Add the WHERE conditions using SQL string method to avoid issue with the builder
    const rawMessages = await messageQuery
      .where(
        or(
          and(
            eq(messages.senderId, req.user.id),
            eq(messages.recipientId, otherUserId)
          ),
          and(
            eq(messages.senderId, otherUserId),
            eq(messages.recipientId, req.user.id)
          )
        )
      )
      .orderBy(messages.createdAt);
    
    console.log(`Raw query returned ${rawMessages.length} messages`);
    if (rawMessages.length > 0) {
      console.log('Sample first message:', JSON.stringify({
        id: rawMessages[0].id,
        senderId: rawMessages[0].senderId,
        recipientId: rawMessages[0].recipientId,
        content: rawMessages[0].content?.substring(0, 20) + (rawMessages[0].content?.length > 20 ? '...' : ''),
        hasImage: !!rawMessages[0].imageUrl,
        is_video: rawMessages[0].is_video,
        createdAt: rawMessages[0].createdAt
      }));
    }
    
    // Get sender details for each message
    const messageList = [];
    for (const msg of rawMessages) {
      // Use the is_video flag from the database if available, otherwise fall back to extension detection
      let isVideo = msg.is_video;
      
      // For backward compatibility with older messages that don't have the is_video field
      if (isVideo === undefined || isVideo === null) {
        // Check if the imageUrl ends with common video extensions
        isVideo = msg.imageUrl ? 
          /\.(mp4|mov|avi|wmv|flv|webm|mkv)$/i.test(msg.imageUrl) : 
          false;
      }
      
      console.log(`Getting sender info for message ${msg.id} from user ${msg.senderId}`);
      const [senderInfo] = await db
        .select({
          id: users.id,
          username: users.username,
          preferredName: users.preferredName,
          imageUrl: users.imageUrl,
        })
        .from(users)
        .where(eq(users.id, msg.senderId));
      
      if (!senderInfo) {
        console.log(`WARNING: No sender info found for user ${msg.senderId}`);
      } else {
        console.log(`Found sender: ${senderInfo.username} (${senderInfo.id})`);
      }
        
      // For Object Storage, return the path as-is for frontend URL construction
      let formattedImageUrl = msg.imageUrl;
      
      console.log(`DEBUG: Message ${msg.id} imageUrl: "${msg.imageUrl}" -> formatted: "${formattedImageUrl}"`);
      
      messageList.push({
        ...msg,
        imageUrl: formattedImageUrl,
        is_video: isVideo,
        sender: senderInfo || { id: msg.senderId, username: 'Unknown User' }
      });
    }
    
    console.log(`Found ${messageList.length} messages with sender info`);
    
    // Debug logging to check what's being returned for images
    messageList.forEach((msg, index) => {
      if (msg.imageUrl) {
        console.log(`Message ${msg.id} (index ${index}) imageUrl:`, msg.imageUrl);
        console.log(`Message ${msg.id} is_video:`, msg.is_video);
      }
    });
    
    return res.json(messageList);
  } catch (error) {
    console.error("DETAILED ERROR fetching messages:", error);
    logger.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// Update message content (edit message)
messageRouter.patch("/api/messages/:messageId", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const messageId = parseInt(req.params.messageId);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    // Get the message to verify ownership
    const [existingMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!existingMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify the user owns this message
    if (existingMessage.senderId !== req.user.id) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }

    // Update the message content
    const [updatedMessage] = await db
      .update(messages)
      .set({ content: content.trim() })
      .where(eq(messages.id, messageId))
      .returning();

    logger.info(`Message ${messageId} updated by user ${req.user.id}`);
    return res.json(updatedMessage);
  } catch (error) {
    logger.error("Error updating message:", error);
    return res.status(500).json({ message: "Failed to update message" });
  }
});

// Delete message
messageRouter.delete("/api/messages/:messageId", authenticate, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const messageId = parseInt(req.params.messageId);

    // Get the message to verify ownership
    const [existingMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!existingMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify the user owns this message
    if (existingMessage.senderId !== req.user.id) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    // Delete associated media files if they exist
    if (existingMessage.imageUrl) {
      try {
        const { Client } = await import("@replit/object-storage");
        const client = new Client();
        
        // Handle HLS videos
        if (existingMessage.imageUrl.includes('/api/hls/')) {
          console.log(`[MESSAGE HLS DELETE] Starting HLS deletion for imageUrl: ${existingMessage.imageUrl}`);
          
          // Extract baseFilename from URL like "/api/hls/1764035901093-IMG_9504/playlist.m3u8"
          const match = existingMessage.imageUrl.match(/\/api\/hls\/([^\/]+)\//);
          console.log(`[MESSAGE HLS DELETE] Regex match result: ${match ? match[1] : 'NO MATCH'}`);
          
          if (match && match[1]) {
            const baseFilename = match[1];
            
            // Delete all files in the HLS directory
            const hlsPrefix = `shared/uploads/hls/${baseFilename}/`;
            console.log(`[MESSAGE HLS DELETE] Using prefix: ${hlsPrefix}`);
            
            try {
              // List all files with the HLS prefix
              console.log(`[MESSAGE HLS DELETE] Calling client.list() with prefix...`);
              const listResult = await client.list({ prefix: hlsPrefix });
              console.log(`[MESSAGE HLS DELETE] List result:`, JSON.stringify(listResult, null, 2));
              
              // Extract the file array from the result
              const files = listResult.value || [];
              console.log(`[MESSAGE HLS DELETE] Found ${files.length} files to delete`);
              
              // Delete all files in the HLS directory
              let deletedCount = 0;
              for (const fileItem of files) {
                const fileKey = fileItem.name;
                console.log(`[MESSAGE HLS DELETE] Attempting to delete: ${fileKey}`);
                try {
                  await client.delete(fileKey);
                  deletedCount++;
                  console.log(`[MESSAGE HLS DELETE] ✅ Successfully deleted: ${fileKey}`);
                } catch (deleteError) {
                  console.error(`[MESSAGE HLS DELETE] ❌ Error deleting ${fileKey}:`, deleteError);
                }
              }
              
              console.log(`[MESSAGE HLS DELETE] Deletion complete: ${deletedCount}/${files.length} files deleted`);
            } catch (hlsError) {
              console.error(`[MESSAGE HLS DELETE] Error during HLS cleanup:`, hlsError);
              // Continue with message deletion even if HLS cleanup fails
            }
          } else {
            console.log(`[MESSAGE HLS DELETE] Could not extract baseFilename from URL: ${existingMessage.imageUrl}`);
          }
        }
        // Handle regular media files
        else {
          // Extract storage key from media URL
          let storageKey = null;
          
          // Format: /api/object-storage/direct-download?storageKey=shared/uploads/filename.ext
          const objectStorageMatch = existingMessage.imageUrl.match(/storageKey=([^&]+)/);
          if (objectStorageMatch && objectStorageMatch[1]) {
            storageKey = decodeURIComponent(objectStorageMatch[1]);
          }
          
          // Format: /api/serve-file?filename=shared/uploads/filename.ext
          const serveFileMatch = existingMessage.imageUrl.match(/filename=([^&]+)/);
          if (serveFileMatch && serveFileMatch[1]) {
            storageKey = decodeURIComponent(serveFileMatch[1]);
          }
          
          if (storageKey) {
            logger.info(`[MESSAGE DELETE] Deleting media file: ${storageKey}`);
            try {
              await client.delete(storageKey);
              logger.info(`[MESSAGE DELETE] Successfully deleted media file for message ${messageId}`);
            } catch (mediaError) {
              logger.error(`[MESSAGE DELETE] Error deleting media file:`, mediaError);
            }
          }
        }
      } catch (error) {
        logger.error(`[MESSAGE DELETE] Error cleaning up media files:`, error);
      }
    }

    // Delete associated poster/thumbnail if it exists
    if (existingMessage.posterUrl) {
      try {
        const { Client } = await import("@replit/object-storage");
        const client = new Client();
        
        let posterStorageKey = null;
        
        const serveFileMatch = existingMessage.posterUrl.match(/filename=([^&]+)/);
        if (serveFileMatch && serveFileMatch[1]) {
          posterStorageKey = decodeURIComponent(serveFileMatch[1]);
        }
        
        if (posterStorageKey) {
          logger.info(`[MESSAGE DELETE] Deleting poster: ${posterStorageKey}`);
          try {
            await client.delete(posterStorageKey);
            logger.info(`[MESSAGE DELETE] Successfully deleted poster for message ${messageId}`);
          } catch (posterError) {
            logger.error(`[MESSAGE DELETE] Error deleting poster:`, posterError);
          }
        }
      } catch (error) {
        logger.error(`[MESSAGE DELETE] Error cleaning up poster:`, error);
      }
    }

    // Delete the message
    await db
      .delete(messages)
      .where(eq(messages.id, messageId));

    logger.info(`Message ${messageId} deleted by user ${req.user.id}`);
    return res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    logger.error("Error deleting message:", error);
    return res.status(500).json({ message: "Failed to delete message" });
  }
});