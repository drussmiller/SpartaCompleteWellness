import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface UploadSession {
  id: string;
  userId: number;
  filename: string;
  mimeType: string;
  totalSize: number;
  chunkSize: number;
  nextChunkIndex: number;
  uploadedBytes: number;
  tempFilePath: string;
  createdAt: Date;
  expiresAt: Date;
}

class UploadSessionManager {
  private sessions: Map<string, UploadSession> = new Map();
  private tempDir: string;
  private readonly SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
  private readonly MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp-uploads');
    this.ensureTempDir();
    this.startCleanupInterval();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.deleteSession(sessionId);
      }
    }
  }

  createSession(
    userId: number,
    filename: string,
    mimeType: string,
    totalSize: number,
    chunkSize: number = this.MAX_CHUNK_SIZE
  ): UploadSession {
    const sessionId = uuidv4();
    const tempFilePath = path.join(this.tempDir, `${sessionId}.tmp`);
    
    const session: UploadSession = {
      id: sessionId,
      userId,
      filename,
      mimeType,
      totalSize,
      chunkSize: Math.min(chunkSize, this.MAX_CHUNK_SIZE),
      nextChunkIndex: 0,
      uploadedBytes: 0,
      tempFilePath,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_EXPIRY_MS),
    };

    this.sessions.set(sessionId, session);
    
    // Create empty temp file
    fs.writeFileSync(tempFilePath, Buffer.alloc(0));
    
    console.log(`Created upload session ${sessionId} for user ${userId}, file: ${filename}, size: ${totalSize}`);
    
    return session;
  }

  getSession(sessionId: string): UploadSession | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    // Check if expired
    if (session.expiresAt < new Date()) {
      this.deleteSession(sessionId);
      return null;
    }
    
    return session;
  }

  appendChunk(sessionId: string, chunkIndex: number, chunkData: Buffer): boolean {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found or expired');
    }
    
    // Validate chunk index
    if (chunkIndex !== session.nextChunkIndex) {
      throw new Error(`Expected chunk ${session.nextChunkIndex}, got ${chunkIndex}`);
    }
    
    // Validate chunk size (allow last chunk to be smaller)
    const isLastChunk = session.uploadedBytes + chunkData.length >= session.totalSize;
    if (!isLastChunk && chunkData.length > session.chunkSize) {
      throw new Error(`Chunk size ${chunkData.length} exceeds maximum ${session.chunkSize}`);
    }
    
    // Append chunk to temp file
    try {
      fs.appendFileSync(session.tempFilePath, chunkData);
      
      // Update session
      session.uploadedBytes += chunkData.length;
      session.nextChunkIndex++;
      session.expiresAt = new Date(Date.now() + this.SESSION_EXPIRY_MS); // Extend expiry
      
      console.log(`Appended chunk ${chunkIndex} to session ${sessionId}, progress: ${session.uploadedBytes}/${session.totalSize}`);
      
      return true;
    } catch (error) {
      console.error(`Error appending chunk to session ${sessionId}:`, error);
      throw error;
    }
  }

  finalizeSession(sessionId: string): Buffer {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found or expired');
    }
    
    // Validate all chunks received
    if (session.uploadedBytes !== session.totalSize) {
      throw new Error(`Incomplete upload: ${session.uploadedBytes}/${session.totalSize} bytes`);
    }
    
    // Read complete file
    try {
      const fileBuffer = fs.readFileSync(session.tempFilePath);
      console.log(`Finalized session ${sessionId}, file size: ${fileBuffer.length}`);
      return fileBuffer;
    } catch (error) {
      console.error(`Error reading finalized file for session ${sessionId}:`, error);
      throw error;
    }
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Delete temp file
      try {
        if (fs.existsSync(session.tempFilePath)) {
          fs.unlinkSync(session.tempFilePath);
        }
      } catch (error) {
        console.error(`Error deleting temp file for session ${sessionId}:`, error);
      }
      
      this.sessions.delete(sessionId);
      console.log(`Deleted upload session ${sessionId}`);
    }
  }

  getSessionProgress(sessionId: string): { uploadedBytes: number; totalSize: number; progress: number } | null {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return null;
    }
    
    return {
      uploadedBytes: session.uploadedBytes,
      totalSize: session.totalSize,
      progress: Math.round((session.uploadedBytes / session.totalSize) * 100),
    };
  }
}

// Export singleton instance
export const uploadSessionManager = new UploadSessionManager();
